import { hashPassword } from '../src/lib/password';
import { withTransaction } from '../src/db';
import * as organisations from '../src/repositories/organisations';
import * as users from '../src/repositories/users';
import * as controls from '../src/repositories/controls';
import * as assignments from '../src/repositories/assignments';
import * as auditLog from '../src/repositories/auditLog';
import * as importProfiles from '../src/repositories/csvImportProfiles';
import * as csvImports from '../src/repositories/csvImports';
import * as aiFeature from '../src/repositories/aiFeature';
import { fileChecksum, parseCsv, validateRows } from '../src/lib/csvImport';
import { createScriptPool, logLine } from './lib';

/**
 * Seeds the demo organisation. Idempotent: if the demo admin already exists,
 * the script logs and exits without writing anything.
 *
 *   DATABASE_URL=... npm run seed
 */

const DEMO_ORG_NAME = 'Acme Legal LLP';
const DEMO_PASSWORD = 'SentinelDemo!2026';
const DEMO_USERS = [
  { email: 'admin@demo.sentinel.app', displayName: 'Alex Doyle', role: 'admin' as const },
  { email: 'manager@demo.sentinel.app', displayName: 'Morgan Reeve', role: 'manager' as const },
  { email: 'employee@demo.sentinel.app', displayName: 'Evan Castell', role: 'employee' as const },
];

const DEMO_CONTROLS: { name: string; description: string; status: 'pending' | 'in_review' | 'passed' | 'deferred' }[] = [
  { name: 'Data Retention Policy reviewed', description: 'Annual review of the firm-wide data retention policy.', status: 'passed' },
  { name: 'Staff compliance training completed', description: 'All fee earners complete the annual regulatory training module.', status: 'in_review' },
  { name: 'Access control audit', description: 'Quarterly review of system access rights against the joiners/leavers list.', status: 'pending' },
  { name: 'Client due diligence files sampled', description: 'Sample 10 client files for completeness of due diligence records.', status: 'pending' },
  { name: 'Conflicts register reviewed', description: 'Monthly review of the conflicts of interest register.', status: 'passed' },
  { name: 'Complaints log reconciled', description: 'Reconcile the complaints log with the regulator return.', status: 'deferred' },
  { name: 'Business continuity plan tested', description: 'Annual tabletop exercise of the continuity plan.', status: 'pending' },
  { name: 'Supervision arrangements confirmed', description: 'Confirm supervision arrangements for all junior staff.', status: 'in_review' },
  { name: 'Undertakings register reviewed', description: 'Quarterly check that all outstanding undertakings are tracked.', status: 'pending' },
  { name: 'Financial sanctions screening evidenced', description: 'Evidence that new clients were screened against the sanctions list.', status: 'passed' },
];

function daysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const DEMO_IMPORT_MAPPING = {
  name: 'Control Name',
  description: 'Details',
  category: 'Category',
  due_date: 'Due Date',
};

/** Mixed demo CSV: three valid rows, one missing name, one past due date.
 * Processed through the real import pipeline so checksums are genuine. */
function demoImportCsv(): Buffer {
  return Buffer.from(
    [
      'Control Name,Details,Category,Due Date',
      `Regulatory horizon scan,Quarterly review of upcoming regulation,Regulatory,${daysFromNow(45)}`,
      `Vendor risk assessments refreshed,Annual reassessment of critical vendors,Third party,${daysFromNow(90)}`,
      ',Row without a control name,Operations,',
      'Password policy attestation,All staff attest to the password policy,Security,2020-01-01',
      'Incident response contact tree verified,,Security,',
    ].join('\n'),
    'utf8'
  );
}

async function main(): Promise<void> {
  const pool = createScriptPool();
  try {
    const existing = await users.findUserByEmail(pool, DEMO_USERS[0]!.email);
    if (existing) {
      logLine('info', 'seed_skipped', { reason: 'Demo organisation already seeded' });
      return;
    }

    const passwordHash = await hashPassword(DEMO_PASSWORD);

    await withTransaction(pool, async (tx) => {
      const org = await organisations.createOrganisation(tx, DEMO_ORG_NAME);

      const created: Record<string, { id: string }> = {};
      for (const u of DEMO_USERS) {
        created[u.role] = await users.createUser(tx, {
          organisationId: org.id,
          email: u.email,
          passwordHash,
          displayName: u.displayName,
          role: u.role,
        });
      }
      const adminUser = created.admin!;
      const managerUser = created.manager!;
      const employeeUser = created.employee!;

      await auditLog.appendAuditEntry(tx, org.id, {
        userId: adminUser.id,
        action: 'organisation_created',
        controlId: null,
      });

      const createdControls = [];
      for (const c of DEMO_CONTROLS) {
        const control = await controls.createControl(tx, org.id, {
          name: c.name,
          description: c.description,
        });
        await auditLog.appendAuditEntry(tx, org.id, {
          userId: adminUser.id,
          action: 'control_created',
          controlId: control.id,
        });
        if (c.status !== 'pending') {
          await controls.updateControlStatus(tx, org.id, control.id, c.status);
          await auditLog.appendAuditEntry(tx, org.id, {
            userId: adminUser.id,
            action: `control_status_${c.status}`,
            controlId: control.id,
          });
        }
        createdControls.push(control);
      }

      // Assignments: one overdue, one due soon, one submitted for review,
      // one accepted — a realistic mid-quarter picture.
      const assignmentPlans = [
        { control: createdControls[2]!, dueInDays: -6, flow: 'open' },
        { control: createdControls[3]!, dueInDays: 7, flow: 'open' },
        { control: createdControls[1]!, dueInDays: 3, flow: 'submitted' },
        { control: createdControls[0]!, dueInDays: -20, flow: 'accepted' },
        { control: createdControls[8]!, dueInDays: 14, flow: 'open' },
      ] as const;

      for (const plan of assignmentPlans) {
        const assignment = await assignments.createAssignment(tx, org.id, {
          controlId: plan.control.id,
          assigneeId: employeeUser.id,
          assignedBy: managerUser.id,
          dueDate: daysFromNow(plan.dueInDays),
        });
        await auditLog.appendAuditEntry(tx, org.id, {
          userId: managerUser.id,
          action: 'control_assigned',
          controlId: plan.control.id,
        });

        if (plan.flow === 'submitted' || plan.flow === 'accepted') {
          await assignments.setEvidenceNote(
            tx,
            org.id,
            assignment.id,
            employeeUser.id,
            'Evidence recorded: checklist completed and archived in the compliance folder.'
          );
          await auditLog.appendAuditEntry(tx, org.id, {
            userId: employeeUser.id,
            action: 'evidence_added',
            controlId: plan.control.id,
          });
          await assignments.submitForReview(tx, org.id, assignment.id, employeeUser.id);
          await auditLog.appendAuditEntry(tx, org.id, {
            userId: employeeUser.id,
            action: 'submitted_for_review',
            controlId: plan.control.id,
          });
        }
        if (plan.flow === 'accepted') {
          await assignments.reviewAssignment(tx, org.id, assignment.id, 'accepted', null);
          await controls.updateControlStatus(tx, org.id, plan.control.id, 'passed');
          await auditLog.appendAuditEntry(tx, org.id, {
            userId: managerUser.id,
            action: 'review_accepted',
            controlId: plan.control.id,
          });
        }
      }

      // Two reusable mapping profiles.
      const standardProfile = await importProfiles.createProfile(tx, org.id, {
        name: 'Standard control register',
        columnMapping: DEMO_IMPORT_MAPPING,
        createdBy: adminUser.id,
      });
      await importProfiles.createProfile(tx, org.id, {
        name: 'Minimal (name + description)',
        columnMapping: { name: 'Control Name', description: 'Details' },
        createdBy: managerUser.id,
      });

      // One completed import run with mixed accepted and rejected rows,
      // processed through the real validation pipeline.
      const csv = demoImportCsv();
      const summary = validateRows(parseCsv(csv), DEMO_IMPORT_MAPPING);
      const importRun = await csvImports.createImportRun(tx, org.id, {
        profileId: standardProfile.id,
        filenameChecksum: fileChecksum(csv),
        totalRows: summary.totalRows,
        acceptedRows: summary.acceptedRows,
        rejectedRows: summary.rejectedRows,
        createdBy: managerUser.id,
      });
      await auditLog.appendAuditEntry(tx, org.id, {
        userId: managerUser.id,
        action: 'import_run_created',
        controlId: null,
        importRunId: importRun.id,
      });
      for (const row of summary.rows) {
        let controlId: string | null = null;
        if (row.status === 'accepted' && row.control) {
          const control = await controls.createControl(tx, org.id, {
            name: row.control.name,
            description: row.control.description,
            category: row.control.category,
            dueDate: row.control.dueDate,
          });
          controlId = control.id;
          await auditLog.appendAuditEntry(tx, org.id, {
            userId: managerUser.id,
            action: 'control_created_by_import',
            controlId,
            importRunId: importRun.id,
          });
        }
        await csvImports.appendRowResult(tx, {
          importRunId: importRun.id,
          rowNumber: row.rowNumber,
          rowChecksum: row.checksum,
          status: row.status,
          rejectionReason: row.rejectionReason,
          controlId,
        });
      }

      // AI review enabled for the demo organisation. No API call happens at
      // seed time — reviews use a stubbed client unless a real
      // OPENAI_API_KEY is configured on the deployment.
      await aiFeature.upsertSettings(tx, org.id, {
        enabled: true,
        maxRequestsPerUserPerDay: 10,
        maxRequestsPerOrgPerDay: 50,
        actorUserId: adminUser.id,
      });
      await auditLog.appendAuditEntry(tx, org.id, {
        userId: adminUser.id,
        action: 'ai_feature_enabled',
        controlId: null,
      });

      logLine('info', 'seed_completed', {
        org_id: org.id,
        users: DEMO_USERS.length,
        controls: createdControls.length,
        assignments: assignmentPlans.length,
        import_runs: 1,
        import_rows: summary.totalRows,
        ai_enabled: true,
      });
    });
  } catch (err) {
    logLine('error', 'seed_failed', { reason: err instanceof Error ? err.message : 'unknown' });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
