import { Route, Routes } from 'react-router-dom';
import Home from '../pages/Home/Home.jsx';
import Contact from '../pages/Legal/Contact.jsx';
import Privacy from '../pages/Legal/Privacy.jsx';
import Terms from '../pages/Legal/Terms.jsx';
import Testament from '../pages/Testament/Testament.jsx';
import ManuscriptMaterials from '../pages/Testament/ManuscriptMaterials.jsx';
import BookPage from '../pages/Testament/BookPage.jsx';
import ChapterPage from '../pages/Testament/ChapterPage.jsx';
import VersePage from '../pages/Testament/VersePage.jsx';
import Search from '../pages/Search/Search.jsx';
import LegacyBookRedirect from '../features/testament/components/LegacyBookRedirect.jsx';
import UnavailablePage from './UnavailablePage.jsx';
import Login from '../pages/Auth/Login.jsx';
import ForgotPassword from '../pages/Auth/ForgotPassword.jsx';
import ResetPassword from '../pages/Auth/ResetPassword.jsx';
import ChangePassword from '../pages/Auth/ChangePassword.jsx';
import VerifyEmail from '../pages/Auth/VerifyEmail.jsx';
import VerificationPending from '../pages/Auth/VerificationPending.jsx';
import Settings from '../pages/Account/Settings.jsx';
import SavedVerses from '../pages/Reading/SavedVerses.jsx';
import Notes from '../pages/Reading/Notes.jsx';
import ReadingHistory from '../pages/Reading/ReadingHistory.jsx';
import Community from '../pages/Community/Community.jsx';
import Discussions from '../pages/Community/Discussions.jsx';
import DiscussionPage from '../pages/Community/DiscussionPage.jsx';
import ReadingCircles from '../pages/Community/ReadingCircles.jsx';
import ReadingCirclePage from '../pages/Community/ReadingCirclePage.jsx';
import Moderation from '../pages/Community/Moderation.jsx';
import Articles from '../pages/Articles/Articles.jsx';
import ArticlePage from '../pages/Articles/ArticlePage.jsx';
import MyArticles from '../pages/Articles/MyArticles.jsx';
import ArticleEditorPage from '../pages/Articles/ArticleEditorPage.jsx';
import ArticleModeration from '../pages/Articles/ArticleModeration.jsx';
import Notifications from '../pages/Account/Notifications.jsx';
import AnalyticsDashboard from '../pages/Analytics/AnalyticsDashboard.jsx';
import AdminLayout from '../components/admin/AdminLayout.jsx';
import AdminOverview from '../pages/Admin/Overview.jsx';
import AdminUsers from '../pages/Admin/Users.jsx';
import AdminUserDetails from '../pages/Admin/UserDetails.jsx';
import AdminArticles from '../pages/Admin/Articles.jsx';
import AdminCommunity from '../pages/Admin/Community.jsx';
import AdminAudit from '../components/admin/AdminAudit.jsx';

export default function AppRoutes() {
  return <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/contact" element={<Contact />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="/testament" element={<Testament />} />
    <Route path="/testament/materials" element={<ManuscriptMaterials />} />
    <Route path="/testament/:bookSlug" element={<BookPage />} />
    <Route path="/testament/:bookSlug/:chapterNumber" element={<ChapterPage />} />
    <Route path="/testament/:bookSlug/:chapterNumber/:verseNumber" element={<VersePage />} />
    <Route path="/books/:bookId" element={<LegacyBookRedirect />} />
    <Route path="/search" element={<Search />} />
    <Route path="/login" element={<Login />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/account/change-password" element={<ChangePassword />} />
    <Route path="/account/settings" element={<Settings />} />
    <Route path="/notifications" element={<Notifications />} />
    <Route path="/owner/analytics" element={<AnalyticsDashboard scope="owner" />} />
    <Route path="/admin/analytics" element={<AnalyticsDashboard scope="admin" />} />
    <Route path="/admin" element={<AdminLayout />}>
      <Route index element={<AdminOverview />} />
      <Route path="users" element={<AdminUsers />} />
      <Route path="users/:id" element={<AdminUserDetails />} />
      <Route path="articles" element={<AdminArticles />} />
      <Route path="articles/:id" element={<AdminArticles />} />
      <Route path="community" element={<AdminCommunity />} />
      <Route path="reports" element={<AdminCommunity reports />} />
      <Route path="audit" element={<AdminAudit />} />
    </Route>
    <Route path="/reading/saved-verses" element={<SavedVerses />} />
    <Route path="/reading/notes" element={<Notes />} />
    <Route path="/reading/history" element={<ReadingHistory />} />
    <Route path="/community" element={<Community />} />
    <Route path="/community/discussions" element={<Discussions />} />
    <Route path="/community/discussions/:id" element={<DiscussionPage />} />
    <Route path="/community/reading-circles" element={<ReadingCircles />} />
    <Route path="/community/reading-circles/:id" element={<ReadingCirclePage />} />
    <Route path="/community/moderation" element={<Moderation />} />
    <Route path="/articles" element={<Articles />} />
    <Route path="/articles/mine" element={<MyArticles />} />
    <Route path="/articles/write" element={<ArticleEditorPage />} />
    <Route path="/articles/mine/:id" element={<ArticleEditorPage />} />
    <Route path="/articles/moderation" element={<ArticleModeration />} />
    <Route path="/articles/moderation/:id" element={<ArticleModeration />} />
    <Route path="/articles/:slug" element={<ArticlePage />} />
    <Route path="/verify-email" element={<VerifyEmail />} />
    <Route path="/verification-pending" element={<VerificationPending />} />
    <Route path="*" element={<UnavailablePage />} />
  </Routes>;
}
