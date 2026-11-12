'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ActionForm, type ActionResult } from '../components/ActionForm';
import { SubmitButton } from '../components/SubmitButton';
import { RecordPicker } from '../components/RecordPicker';
import { setSocialGroupAccessAction } from './actions';

export function SocialActionForm({ action, children, className }: { action: (data: FormData) => Promise<ActionResult>; children: ReactNode; className?: string }) {
  const router = useRouter();
  return <ActionForm action={action} className={className} onSuccess={() => router.refresh()} onError={(_message, refresh) => { if (refresh) router.refresh(); }}>{children}</ActionForm>;
}
export function SocialAddContributor({ groupId, options }: { groupId: string; options: Array<{ value: string; label: string }> }) {
  const [selected, setSelected] = useState('');
  return <SocialActionForm action={setSocialGroupAccessAction} className="social-inline-form"><input type="hidden" name="groupId" value={groupId} /><input type="hidden" name="enabled" value="true" /><RecordPicker name="userId" label="Add contributor" options={options} placeholder="Find a tenant user" onChange={setSelected} /><SubmitButton disabled={!selected}>Grant group access</SubmitButton></SocialActionForm>;
}
export function CopyCaption({ caption }: { caption: string }) {
  const [message, setMessage] = useState('');
  return <div className="social-inline-actions"><button className="secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(caption); setMessage('Caption copied.'); } catch { setMessage('Copy the caption from the preview above.'); } }}>Copy caption</button>{message ? <span role="status">{message}</span> : null}</div>;
}
