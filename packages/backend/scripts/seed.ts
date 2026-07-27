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

function daysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * The demo control library: a mid-quarter compliance picture for an SRA-
 * regulated firm. Every control carries a category and a due date — these are
 * the two fields the CSV import maps onto, so leaving them empty would make
 * that feature look pointless in the UI.
 */
const DEMO_CONTROLS: {
  name: string;
  description: string;
  category: string;
  dueInDays: number;
  status: 'pending' | 'in_review' | 'passed' | 'deferred';
}[] = [
  { name: 'Client due diligence files sampled', description: 'Sample 10 client files opened this quarter for completeness of CDD records.', category: 'AML', dueInDays: 9, status: 'in_review' },
  { name: 'Financial sanctions screening evidenced', description: 'Evidence that new clients and matters were screened against the consolidated sanctions list.', category: 'AML', dueInDays: 38, status: 'passed' },
  { name: 'Source of funds documented on high-risk matters', description: 'Confirm source of funds is recorded and corroborated for every high-risk matter.', category: 'AML', dueInDays: 21, status: 'pending' },
  { name: 'Conflicts register reviewed', description: 'Monthly review of the conflicts of interest register and any declined instructions.', category: 'Conduct', dueInDays: 12, status: 'passed' },
  { name: 'Undertakings register reviewed', description: 'Quarterly check that all outstanding professional undertakings are tracked and discharged.', category: 'Conduct', dueInDays: -4, status: 'pending' },
  { name: 'Complaints log reconciled with SRA return', description: 'Reconcile the internal complaints log against the figures reported to the regulator.', category: 'Client care', dueInDays: 55, status: 'deferred' },
  { name: 'Client care letters reviewed', description: 'Check engagement letters meet SRA transparency and costs-information rules.', category: 'Client care', dueInDays: 27, status: 'pending' },
  { name: 'Client account reconciliation signed off', description: 'Monthly three-way reconciliation under the SRA Accounts Rules, signed by the COFA.', category: 'Client money', dueInDays: 6, status: 'pending' },
  { name: 'Data retention policy reviewed', description: 'Annual review of the firm-wide data retention and file destruction policy.', category: 'Records', dueInDays: 74, status: 'passed' },
  { name: 'File closure and archiving checks', description: 'Verify closed matter files are archived with the correct retention date applied.', category: 'Records', dueInDays: 33, status: 'pending' },
  { name: 'Staff compliance training completed', description: 'All fee earners complete the annual regulatory and AML training modules.', category: 'Training', dueInDays: 16, status: 'in_review' },
  { name: 'Access control audit', description: 'Quarterly review of case management access rights against the joiners and leavers list.', category: 'Security', dueInDays: -11, status: 'in_review' },
  { name: 'Supervision arrangements confirmed', description: 'Confirm named supervisors and file review frequency for all junior fee earners.', category: 'Governance', dueInDays: 48, status: 'pending' },
  { name: 'Business continuity plan tested', description: 'Annual tabletop exercise of the continuity and disaster recovery plan.', category: 'Resilience', dueInDays: 91, status: 'pending' },
];

/** Canonical CSV headers — shared by the downloadable template, the sample
 * file offered in the UI, and the saved mapping profiles below, so a saved
 * profile applies cleanly to a freshly downloaded template. */
const DEMO_IMPORT_MAPPING = {
  name: 'Control Name',
  description: 'Description',
  category: 'Category',
  due_date: 'Due Date',
};

/** Mixed demo CSV: three valid rows, one missing a name, one with a past due
 * date. Processed through the real import pipeline so the stored checksums
 * verify against the original rows. */
function demoImportCsv(): Buffer {
  return Buffer.from(
    [
      'Control Name,Description,Category,Due Date',
      `Regulatory horizon scan,Quarterly review of upcoming SRA and Law Society guidance,Governance,${daysFromNow(45)}`,
      `Counsel and expert engagement checks,Confirm terms and PII cover for instructed counsel,Third party,${daysFromNow(90)}`,
      ',Row without a control name,Conduct,',
      'Cyber insurance renewal evidenced,Renewal certificate filed with the practice manager,Governance,2020-01-01',
      'Outsourced services register reviewed,,Third party,',
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
          category: c.category,
          dueDate: daysFromNow(c.dueInDays),
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

      // Assignments covering every state the UI can render, so each demo
      // role lands on a dashboard with real work on it.
      //
      // The two 'submitted' items are deliberately paired: one carries
      // detailed, quotable evidence and one is vague. A manager can run the
      // bounded AI review on both and see each branch of the citation
      // enforcement — a cited assessment, and an explicit
      // insufficient-evidence response. Without that pairing the feature
      // cannot be demonstrated.
      const assignmentPlans = [
        {
          control: createdControls[0]!, // Client due diligence files sampled
          dueInDays: 9,
          flow: 'submitted',
          evidence:
            'Sampled 10 client files opened between 1 April and 30 June. All 10 held certified ' +
            'photographic ID and a proof of address dated within three months of onboarding. ' +
            '8 of the 10 recorded source of funds at the point of instruction. Two files ' +
            '(M-2261 and M-2288) were missing an updated matter risk assessment; both were ' +
            'remediated on 14 July and re-checked by the supervising partner. The completed ' +
            'sampling sheet is saved as Compliance/2026/Q2 CDD Sampling.xlsx.',
        },
        {
          control: createdControls[11]!, // Access control audit
          dueInDays: -11,
          flow: 'submitted',
          evidence: 'Checked — all fine. See the shared folder.',
        },
        {
          control: createdControls[10]!, // Staff compliance training completed
          dueInDays: 16,
          flow: 'rejected',
          evidence:
            'Training completion report exported from the learning portal on 3 July. ' +
            '38 of 41 fee earners have completed both modules.',
          rejectionReason:
            'The export does not cover the three fee earners who joined in June. Please re-run ' +
            'it including new joiners and confirm their completion dates.',
        },
        {
          control: createdControls[1]!, // Financial sanctions screening evidenced
          dueInDays: -20,
          flow: 'accepted',
          evidence:
            'All 27 new matters opened in June were screened against the consolidated sanctions ' +
            'list before the client care letter was issued. Screening reference numbers are ' +
            'recorded on each matter file; two potential name matches were reviewed and ' +
            'discounted with a written rationale.',
        },
        { control: createdControls[4]!, dueInDays: -4, flow: 'open' }, // Undertakings register (overdue)
        { control: createdControls[7]!, dueInDays: 6, flow: 'open' }, // Client account reconciliation
        { control: createdControls[6]!, dueInDays: 27, flow: 'open' }, // Client care letters
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

        if (plan.flow === 'open') continue;

        await assignments.setEvidenceNote(
          tx,
          org.id,
          assignment.id,
          employeeUser.id,
          plan.evidence
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

        if (plan.flow === 'accepted') {
          await assignments.reviewAssignment(tx, org.id, assignment.id, 'accepted', null);
          await controls.updateControlStatus(tx, org.id, plan.control.id, 'passed');
          await auditLog.appendAuditEntry(tx, org.id, {
            userId: managerUser.id,
            action: 'review_accepted',
            controlId: plan.control.id,
          });
        }
        if (plan.flow === 'rejected') {
          await assignments.reviewAssignment(
            tx,
            org.id,
            assignment.id,
            'rejected',
            plan.rejectionReason
          );
          await controls.updateControlStatus(tx, org.id, plan.control.id, 'pending');
          await auditLog.appendAuditEntry(tx, org.id, {
            userId: managerUser.id,
            action: 'review_rejected',
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
        columnMapping: { name: 'Control Name', description: 'Description' },
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
