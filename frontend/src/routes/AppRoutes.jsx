import { Route, Routes } from 'react-router-dom';
import Home, { PublicHome } from '../pages/Home/Home.jsx';
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
import Register from '../pages/Auth/Register.jsx';
import AuthenticatedRoute from './AuthenticatedRoute.jsx';
import { Navigate } from 'react-router-dom';
import Notifications from '../pages/Account/Notifications.jsx';
import AnalyticsDashboard from '../pages/Analytics/AnalyticsDashboard.jsx';
import AdminLayout from '../components/admin/AdminLayout.jsx';
import AdminOverview from '../pages/Admin/Overview.jsx';
import AdminUsers from '../pages/Admin/Users.jsx';
import AdminUserDetails from '../pages/Admin/UserDetails.jsx';
import AdminArticles from '../pages/Admin/Articles.jsx';
import AdminCommunity from '../pages/Admin/Community.jsx';
import AdminAudit from '../components/admin/AdminAudit.jsx';
import Questions from '../pages/Questions/Questions.jsx';
import QuestionPage from '../pages/Questions/QuestionPage.jsx';
import About from '../pages/About/About.jsx';

export default function AppRoutes() {
  return <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/welcome" element={<PublicHome />} />
    <Route path="/dashboard" element={<AuthenticatedRoute><Home /></AuthenticatedRoute>} />
    <Route path="/read" element={<Navigate to="/testament" replace />} />
    <Route path="/explore" element={<Navigate to="/testament" replace />} />
    <Route path="/contact" element={<Contact />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="/about" element={<About />} />
    <Route path="/testament" element={<Testament />} />
    <Route path="/testament/materials" element={<ManuscriptMaterials />} />
    <Route path="/testament/:bookSlug" element={<BookPage />} />
    <Route path="/testament/:bookSlug/:chapterNumber" element={<ChapterPage />} />
    <Route path="/testament/:bookSlug/:chapterNumber/:verseNumber" element={<VersePage />} />
    <Route path="/books/:bookId" element={<LegacyBookRedirect />} />
    <Route path="/search" element={<Search />} />
    <Route path="/questions" element={<Questions />} />
    <Route path="/questions/:questionSlug" element={<QuestionPage />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/account/change-password" element={<AuthenticatedRoute><ChangePassword /></AuthenticatedRoute>} />
    <Route path="/account/settings" element={<AuthenticatedRoute><Settings /></AuthenticatedRoute>} />
    <Route path="/notifications" element={<AuthenticatedRoute><Notifications /></AuthenticatedRoute>} />
    <Route path="/owner/analytics" element={<AuthenticatedRoute><AnalyticsDashboard scope="owner" /></AuthenticatedRoute>} />
    <Route path="/admin/analytics" element={<AuthenticatedRoute><AnalyticsDashboard scope="admin" /></AuthenticatedRoute>} />
    <Route path="/admin" element={<AuthenticatedRoute><AdminLayout /></AuthenticatedRoute>}>
      <Route index element={<AdminOverview />} />
      <Route path="users" element={<AdminUsers />} />
      <Route path="users/:id" element={<AdminUserDetails />} />
      <Route path="articles" element={<AdminArticles />} />
      <Route path="articles/:id" element={<AdminArticles />} />
      <Route path="community" element={<AdminCommunity />} />
      <Route path="reports" element={<AdminCommunity reports />} />
      <Route path="audit" element={<AdminAudit />} />
    </Route>
    <Route path="/reading/saved-verses" element={<AuthenticatedRoute><SavedVerses /></AuthenticatedRoute>} />
    <Route path="/reading/notes" element={<AuthenticatedRoute><Notes /></AuthenticatedRoute>} />
    <Route path="/reading/history" element={<AuthenticatedRoute><ReadingHistory /></AuthenticatedRoute>} />
    <Route path="/community" element={<Community />} />
    <Route path="/community/discussions" element={<Discussions />} />
    <Route path="/community/discussions/:id" element={<DiscussionPage />} />
    <Route path="/community/reading-circles" element={<ReadingCircles />} />
    <Route path="/community/reading-circles/:id" element={<ReadingCirclePage />} />
    <Route path="/community/moderation" element={<AuthenticatedRoute><Moderation /></AuthenticatedRoute>} />
    <Route path="/articles" element={<Articles />} />
    <Route path="/articles/mine" element={<AuthenticatedRoute><MyArticles /></AuthenticatedRoute>} />
    <Route path="/articles/write" element={<AuthenticatedRoute><ArticleEditorPage /></AuthenticatedRoute>} />
    <Route path="/articles/mine/:id" element={<AuthenticatedRoute><ArticleEditorPage /></AuthenticatedRoute>} />
    <Route path="/articles/moderation" element={<AuthenticatedRoute><ArticleModeration /></AuthenticatedRoute>} />
    <Route path="/articles/moderation/:id" element={<AuthenticatedRoute><ArticleModeration /></AuthenticatedRoute>} />
    <Route path="/articles/:slug" element={<ArticlePage />} />
    <Route path="/verify-email" element={<VerifyEmail />} />
    <Route path="/verification-pending" element={<VerificationPending />} />
    <Route path="*" element={<UnavailablePage />} />
  </Routes>;
}
