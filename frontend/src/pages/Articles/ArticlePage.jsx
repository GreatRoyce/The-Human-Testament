import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';
import { articlesService } from '../../services/articles.service.js';
import { authService } from '../../services/auth.service.js';
import ArticleFrame from '../../components/articles/ArticleFrame.jsx';
import ArticleContent from '../../components/articles/ArticleContent.jsx';
import { Resource, ReportForm } from '../../components/community/CommunityUI.jsx';
export default function ArticlePage() {
  const { slug } = useParams(), identity = useCommunityIdentity();
  const load = useCallback(options => articlesService.get(slug, options), [slug]);
  const resource = useResource(load, `article:${slug}:${authService.getSessionVersion()}`);
  return <ArticleFrame title="Reader article" identity={identity}><Resource resource={resource}>{article => <><ArticleContent article={article} />
    <ReportForm targetType="article" targetId={article.id} enabled={identity.data?.emailVerified === true} /></>}</Resource></ArticleFrame>;
}
