'use client';
import { CrmForm } from '../components/CrmForm';
import { transitionTastingAction } from './actions';
import type { TastingAction } from '../../lib/tastings/service';

export function TastingWorkflow({ id, version, coordinator, assigned, terminal, tasterResponse, agencyApproval, stateApproval, emailsGathered, postEventNotes, tasterFeedback, completed, showNextStep = true, showSecondary = true }: { id: string; version: number; coordinator: boolean; assigned: boolean; terminal: boolean; completed: boolean; tasterResponse: string; agencyApproval: string; stateApproval: string; emailsGathered: number | null; postEventNotes: string; tasterFeedback: string; showNextStep?: boolean; showSecondary?: boolean }) {
  function actionForm(action: TastingAction, label: string, requiredComment = false, commentLabel = 'Comment (optional)') {
    return <CrmForm key={action} action={transitionTastingAction} submitLabel={label}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} /><input type="hidden" name="action" value={action} />
      {requiredComment || ['AGENCY_DENY', 'STATE_DENY'].includes(action) ? <label>{commentLabel}<textarea name="comment" rows={2} required={requiredComment} maxLength={2000} /></label> : null}
      {action === 'STATE_APPROVE' ? <label>State reference (optional)<input name="stateReference" maxLength={200} /></label> : null}
    </CrmForm>;
  }
  return <>
    {showNextStep && !terminal ? <section className="tasting-next" aria-labelledby="tasting-next-step"><h2 id="tasting-next-step">Next step</h2>
      {assigned && tasterResponse !== 'APPROVED' ? <div className="tasting-response">{actionForm('TASTER_APPROVE', 'Approve')}<details className="tasting-support"><summary>Needs Edit</summary>{actionForm('TASTER_NEEDS_EDIT', 'Send edit request', true, 'What needs to change?')}</details></div> : null}
      {coordinator && tasterResponse === 'APPROVED' && agencyApproval === 'NOT_REQUESTED' ? actionForm('REQUEST_AGENCY_APPROVAL', 'Request Agency Approval') : null}
      {coordinator && agencyApproval === 'REQUESTED' ? <>{actionForm('AGENCY_APPROVE', 'Mark Agency Approved')}<details className="tasting-support"><summary>Record Agency denial</summary>{actionForm('AGENCY_DENY', 'Mark Agency Denied', false, 'Denial reason (optional)')}</details></> : null}
      {coordinator && tasterResponse === 'APPROVED' && agencyApproval === 'APPROVED' && stateApproval === 'NOT_SUBMITTED' ? actionForm('SUBMIT_TO_STATE', 'Submit to State') : null}
      {coordinator && stateApproval === 'SUBMITTED' ? <>{actionForm('STATE_APPROVE', 'Mark State Approved')}<details className="tasting-support"><summary>Record State denial</summary>{actionForm('STATE_DENY', 'Mark State Denied', false, 'Denial reason (optional)')}</details></> : null}
      {tasterResponse !== 'APPROVED' && !(assigned && tasterResponse !== 'APPROVED') ? <p className="muted">{tasterResponse === 'NEEDS_EDIT' ? 'Review the taster’s edit request and revise the proposal.' : 'Waiting for the assigned taster to respond.'}</p> : null}
      {stateApproval === 'APPROVED' ? <p className="muted">Approved schedule. Log the tasting visit on its date with the required photo.</p> : null}
      {!coordinator && tasterResponse === 'APPROVED' && stateApproval !== 'APPROVED' ? <p className="muted">Your assignment is approved. The coordinator will record Agency and State decisions.</p> : null}
    </section> : null}
    {showSecondary && (assigned || coordinator) ? <details className="tasting-support"><summary>{completed ? 'Post-tasting feedback' : 'Taster feedback and post-event notes'}</summary><CrmForm action={transitionTastingAction} submitLabel="Save feedback"><input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} /><input type="hidden" name="action" value="SAVE_FEEDBACK" /><label>Emails gathered<input name="emailsGathered" type="number" min={0} max={100000} defaultValue={emailsGathered ?? ''} /></label><label>Post-event notes<textarea name="postEventNotes" rows={3} maxLength={6000} defaultValue={postEventNotes} /></label><label>Taster notes / feedback<textarea name="tasterFeedback" rows={3} maxLength={6000} defaultValue={tasterFeedback} /></label></CrmForm></details> : null}
    {showSecondary && coordinator && !terminal ? <details className="tasting-support"><summary>Cancel tasting</summary>{actionForm('CANCEL', 'Cancel tasting', true, 'Cancellation reason')}</details> : null}
  </>;
}
