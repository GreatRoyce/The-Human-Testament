import { Link, useParams } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import { questions } from '../../data/questions.js';
import { manuscriptVerse } from '../../services/manuscriptContent.js';

export default function QuestionPage() {
  const { questionSlug } = useParams();
  const question = questions.find(item => item.slug === questionSlug);

  if (!question) return <ContentPage title="Question not found">
    <p className="mb-6 text-sm leading-7 text-muted">This question is not available. Browse the questions currently connected to the Testament.</p>
    <Link to="/questions" className="text-sm text-forest underline underline-offset-4">Browse questions</Link>
  </ContentPage>;

  return <ContentPage title={question.question}>
    <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-bronze-ink">{question.tag}</p>
    <p className="max-w-reading text-base leading-7 text-charcoal">{question.premise}</p>
    <h2 className="mb-4 mt-9 font-serif text-2xl text-forest">Read the passages</h2>
    <ol className="space-y-4">
      {question.passages.map(address => {
        const [bookSlug, chapterText, verseText] = address.split(':');
        const chapter = Number(chapterText);
        const verse = Number(verseText);
        return <li key={address} className="border-l-2 border-bronze-soft bg-white/70 p-5">
          <blockquote className="font-serif text-lg leading-8 text-charcoal">{manuscriptVerse(bookSlug, chapter, verse)}</blockquote>
          <p className="mt-3 font-mono text-xs uppercase text-muted">{bookSlug} {chapter}:{verse}</p>
          <Link to={`/testament/${bookSlug}/${chapter}/${verse}`} className="mt-3 inline-flex min-h-11 items-center text-sm text-forest underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest">
            Read in the Testament
          </Link>
        </li>;
      })}
    </ol>
    <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-5 text-sm">
      <Link to="/questions" className="text-forest underline underline-offset-4">All questions</Link>
      <Link to="/community/discussions" className="text-forest underline underline-offset-4">Explore reader discussions</Link>
    </div>
  </ContentPage>;
}