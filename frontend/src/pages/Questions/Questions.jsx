import { Link } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import { questions } from '../../data/questions.js';

export default function Questions() {
  return <ContentPage title="Questions worth living with">
    <p className="mb-8 max-w-reading text-sm leading-7 text-muted">
      Begin with a question, follow its passages into the Testament, and decide what the reading leaves you asking.
    </p>
    <ul className="grid gap-5 sm:grid-cols-2">
      {questions.map(question => <li key={question.slug}>
        <article className="flex h-full flex-col border border-border bg-white/70 p-5">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-bronze-ink">{question.tag}</p>
          <h2 className="mt-3 font-serif text-2xl text-forest">{question.question}</h2>
          <p className="mt-3 text-sm leading-7 text-muted">{question.premise}</p>
          <p className="mt-4 font-mono text-xs text-muted">{question.ref}</p>
          <Link to={`/questions/${question.slug}`} className="mt-auto inline-flex min-h-11 items-center pt-4 text-sm font-semibold text-forest underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest">
            Enter through this question
          </Link>
        </article>
      </li>)}
    </ul>
  </ContentPage>;
}