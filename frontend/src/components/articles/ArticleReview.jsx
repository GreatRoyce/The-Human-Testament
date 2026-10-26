import { useState } from 'react';
import { articlesService } from '../../services/articles.service.js';
import ArticleContent from './ArticleContent.jsx';
import PublicationHistory from './PublicationHistory.jsx';
import { ActionForm, Field, inputClass } from '../community/CommunityUI.jsx';
export default function ArticleReview({ article, refresh }) {
  const [saved, setSaved] = useState(false);
  return <div className="space-y-7"><ArticleContent article={article} />
    {article.reviewReason && <p className="text-sm leading-7">Latest moderator reason: {article.reviewReason}</p>}
    {article.status !== 'archived' && <ActionForm label="Record publication decision" confirmation="Confirm this publication decision for the reviewed version. The author will receive the reason, and the decision remains in the audit history." onSave={async values => { await articlesService.review(article.id, { ...values, expectedRevision: article.revision }); setSaved(true); refresh(); return { message: 'Publication decision recorded.' }; }}>
      <p className="text-xs text-muted">This decision applies to version {article.revision}. Authors cannot review their own articles.</p>
      <Field label="Decision"><select name="action" className={inputClass}>
        {article.status === 'pending_review' && <><option value="approve">Approve publication</option><option value="reject">Reject submission</option></>}
        {article.status === 'published' && <option value="unpublish">Unpublish for revision</option>}<option value="archive">Archive article</option></select></Field>
      <Field name="reason" label="Reason (shared with the author; never include secrets)" required multiline maxLength={1000} /></ActionForm>}
    {saved && <p role="status">Publication decision recorded.</p>}<PublicationHistory key={article.revision} id={article.id} moderator />
  </div>;
}
