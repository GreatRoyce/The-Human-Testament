import { Route, Routes } from 'react-router-dom';
import Home from '../pages/Home/Home.jsx';
import Contact from '../pages/Legal/Contact.jsx';
import Privacy from '../pages/Legal/Privacy.jsx';
import Terms from '../pages/Legal/Terms.jsx';
import Testament from '../pages/Testament/Testament.jsx';
import BookPage from '../pages/Testament/BookPage.jsx';
import ChapterPage from '../pages/Testament/ChapterPage.jsx';
import VersePage from '../pages/Testament/VersePage.jsx';
import Search from '../pages/Search/Search.jsx';
import LegacyBookRedirect from '../features/testament/components/LegacyBookRedirect.jsx';
import UnavailablePage from './UnavailablePage.jsx';

export default function AppRoutes() {
  return <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/contact" element={<Contact />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="/testament" element={<Testament />} />
    <Route path="/testament/:bookSlug" element={<BookPage />} />
    <Route path="/testament/:bookSlug/:chapterNumber" element={<ChapterPage />} />
    <Route path="/testament/:bookSlug/:chapterNumber/:verseNumber" element={<VersePage />} />
    <Route path="/books/:bookId" element={<LegacyBookRedirect />} />
    <Route path="/search" element={<Search />} />
    <Route path="*" element={<UnavailablePage />} />
  </Routes>;
}
