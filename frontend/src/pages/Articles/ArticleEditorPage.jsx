import { useCallback, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';
import { articlesService } from '../../services/articles.service.js';
import { authService } from '../../services/auth.service.js';
import ArticleFrame from '../../components/articles/ArticleFrame.jsx';
import ArticleContent from '../../components/articles/ArticleContent.jsx';
import ArticleEditor from '../../components/articles/ArticleEditor.jsx';
import PublicationHistory from '../../components/articles/PublicationHistory.jsx';
import { Resource, Action } from '../../components/community/CommunityUI.jsx';
export default function ArticleEditorPage() {
  const { id } = useParams(), identity = useCommunityIdentity(), navigate = useNavigate();
  const [dirty, setDirty] = useState(false);
  const load = useCallback(options => id ? articlesService.own(id, options) : Promise.resolve({ newDraft: true }), [id]);
  const resource = useResource(load, `article-editor:${id || 'new'}:${authService.getSessionVersion()}`, id ? undefined : { newDraft: true });
  return <ArticleFrame title={id ? 'Manage article' : 'Write an article'} identity={identity}>
    <Resource resource={resource}>{value => {
      const article = value.newDraft ? undefined : value, editable = !article || ['draft', 'rejected'].includes(article.status);
      return <div className="space-y-7"><p className="text-sm text-forest">Status: {article?.status || 'unsaved draft'}{article && ' · version ' + article.revision}</p>
        {article?.reviewReason && <aside className="border-l-2 border-bronze-ink pl-4 text-sm leading-7">Moderator reason: {article.reviewReason}</aside>}
        {editable && identity.data?.emailVerified ? <ArticleEditor key={article?.revision ?? 'new'} article={article} onDirtyChange={setDirty} onSave={async input => {
          const saved = article ? await articlesService.update(article.id, { ...input, expectedRevision: article.revision }) : await articlesService.create(input);
          setDirty(false);
          if (!article) navigate('/articles/mine/' + saved.id); else resource.retry();
        }} /> : article ? <ArticleContent article={article} /> : <p className="text-sm text-muted">Log in and verify your email before writing.</p>}
        {article && identity.data?.emailVerified && <>
          {editable && (dirty ? <p role="status" className="text-sm text-muted">Save your current edits before submitting.</p> : <Action run={async () => { await articlesService.submit(article.id, article.revision); resource.retry(); return { message: 'Submitted for peer review.' }; }}>Submit saved draft for review</Action>)}
          {article.status === 'published' ? <p className="text-sm leading-7 text-muted">Published articles are read-only. Ask a moderator to unpublish before revising. <Link className="underline text-forest" to={'/articles/' + article.slug}>Read the public article</Link></p> :
            article.status !== 'archived' && <Action run={async () => { await articlesService.archive(article.id); resource.retry(); }}>Archive article</Action>}
        </>}{article && <PublicationHistory key={article.revision} id={article.id} />}
      </div>;
    }}</Resource>
  </ArticleFrame>;
}
