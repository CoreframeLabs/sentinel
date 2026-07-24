import { hashPassword } from '../src/lib/password';
import { withTransaction } from '../src/db';
import * as organisations from '../src/repositories/organisations';
import * as users from '../src/repositories/users';
import * as controls from '../src/repositories/controls';
import * as assignments from '../src/repositories/assignments';
import * as auditLog from '../src/repositories/auditLog';
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

      logLine('info', 'seed_completed', {
        org_id: org.id,
        users: DEMO_USERS.length,
        controls: createdControls.length,
        assignments: assignmentPlans.length,
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
