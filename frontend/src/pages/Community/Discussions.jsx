import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { communityService } from '../../services/community.service.js';
import DiscussionList from '../../components/community/DiscussionList.jsx';
import { CommunityFrame, Resource, Pagination, ActionForm, Field } from '../../components/community/CommunityUI.jsx';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';
import { authService } from '../../services/auth.service.js';

export default function Discussions() {
  const identity = useCommunityIdentity(), [params, setParams] = useSearchParams(), navigate = useNavigate();
  const query = params.toString();
  const load = useCallback(options => {
    const values = Object.fromEntries(new URLSearchParams(query));
    if (values.verseId) { const [bookId, chapter] = values.verseId.split(':'); values.bookId = bookId; values.chapterNumber = chapter; }
    return communityService.discussions(values, options);
  }, [query]);
  const resource = useResource(load, `discussions:${query}:${authService.getSessionVersion()}`);
  return <CommunityFrame title="Discussions" identity={identity}>
    <ActionForm key={params.get('verseId') || 'all'} label="Filter discussions" onSave={values => { const next = new URLSearchParams(); if (values.verseId) next.set('verseId', values.verseId.trim()); setParams(next); }}>
      <Field name="verseId" label="Canonical verse ID (optional)" placeholder="freedom:10:14" defaultValue={params.get('verseId') || ''} maxLength={100} />
    </ActionForm>
    <Resource resource={resource} empty="No discussions match this passage yet.">{data => <><DiscussionList items={data.items} />
      <Pagination pagination={data.pagination} onPage={page => { const next = new URLSearchParams(params); next.set('page', page); setParams(next); }} /></>}</Resource>
    {identity.data?.emailVerified && <details className="space-y-4"><summary className="cursor-pointer text-forest underline">Start a discussion</summary>
      <ActionForm label="Publish discussion" onSave={async values => {
        const verseId = values.verseId.trim(), reference = verseId ? { verseId, bookId: verseId.split(':')[0], chapterNumber: Number(verseId.split(':')[1]) } : {};
        const row = await communityService.createDiscussion({ title: values.title, body: values.body, ...reference }); navigate('/community/discussions/' + row.id);
      }}><Field label="Title" name="title" required maxLength={160} /><Field label="Your contribution" name="body" multiline required maxLength={10000} />
        <Field label="Canonical verse ID (optional)" name="verseId" maxLength={100} defaultValue={params.get('verseId') || ''} placeholder="freedom:10:14" />
      </ActionForm></details>}
  </CommunityFrame>;
}
