# Migration file inventory

Paths are relative to frontend/. Moved files may also have import or service-boundary edits; they appear only under Moves. No populated content was deleted.

## Created (43)

- `docs/FRONTEND_ARCHITECTURE.md`
- `docs/MIGRATION_FILES.md`
- `scripts/check-content-ui.mjs`
- `src/components/layout/ContentPage.jsx`
- `src/components/shared/ResourceState.jsx`
- `src/config/api.config.js`
- `src/data/mock/testament/provider.js`
- `src/data/mock/testament/verseApparatus.js`
- `src/features/home/content/apparatusCopy.js`
- `src/features/home/content/readerCopy.js`
- `src/features/reader/components/ChapterReader.jsx`
- `src/features/reader/components/MarginNotes.jsx`
- `src/features/reader/components/ReaderControls.jsx`
- `src/features/reader/components/ReaderPreview.jsx`
- `src/features/reader/components/VerseList.jsx`
- `src/features/reader/hooks/useReaderSelection.js`
- `src/features/search/components/SearchForm.jsx`
- `src/features/search/components/SearchResults.jsx`
- `src/features/search/hooks/useSearch.js`
- `src/features/search/services/searchService.js`
- `src/features/search/types/contracts.js`
- `src/features/search/types/search.d.ts`
- `src/features/testament/components/ChapterNavigation.jsx`
- `src/features/testament/components/LegacyBookRedirect.jsx`
- `src/features/testament/hooks/useBook.js`
- `src/features/testament/hooks/useBooks.js`
- `src/features/testament/hooks/useChapter.js`
- `src/features/testament/hooks/useChapters.js`
- `src/features/testament/services/bookService.js`
- `src/features/testament/services/chapterService.js`
- `src/features/testament/services/verseService.js`
- `src/features/testament/types/content.d.ts`
- `src/features/testament/types/contracts.js`
- `src/features/testament/utils/contentAddress.js`
- `src/hooks/useResource.js`
- `src/routes/UnavailablePage.jsx`
- `src/services/api/ApiError.js`
- `src/services/api/client.js`
- `src/services/api/contentApi.js`
- `src/services/contentSource.js`
- `src/types/api.d.ts`
- `tests/api-mode.test.mjs`
- `tests/content.test.mjs`

## Moved (16)

| Before | After |
| --- | --- |
| `src/components/home/BookCollection.jsx` | `src/features/home/components/BookCollection.jsx` |
| `src/components/home/CommunitySection.jsx` | `src/features/home/components/CommunitySection.jsx` |
| `src/components/home/Dialogue.jsx` | `src/features/home/components/Dialogue.jsx` |
| `src/components/home/EssayReflections.jsx` | `src/features/home/components/EssayReflections.jsx` |
| `src/components/home/FeaturedVerse.jsx` | `src/features/home/components/FeaturedVerse.jsx` |
| `src/components/home/Hero.jsx` | `src/features/home/components/Hero.jsx` |
| `src/components/home/InquiryPaths.jsx` | `src/features/home/components/InquiryPaths.jsx` |
| `src/components/home/LivingInquiry.jsx` | `src/features/home/components/LivingInquiry.jsx` |
| `src/components/home/PathOfInquiry.jsx` | `src/features/home/components/PathOfInquiry.jsx` |
| `src/components/home/PhysicalBookSection.jsx` | `src/features/home/components/PhysicalBookSection.jsx` |
| `src/components/home/Sanctuary.jsx` | `src/features/home/components/Sanctuary.jsx` |
| `src/components/home/BookCard.jsx` | `src/features/testament/components/BookGrid.jsx` |
| `src/components/home/Footer.jsx` | `src/components/layout/Footer.jsx` |
| `src/data/books.js` | `src/data/mock/testament/books.js` |
| `src/data/featuredVerses.js` | `src/data/mock/testament/featuredVerses.js` |
| `src/data/readerSection.js` | `src/data/mock/testament/readerSection.js` |

## Modified in place (18)

- `.env.example`
- `README.md`
- `package.json`
- `scripts/check-home-ui.mjs`
- `src/App.jsx`
- `src/components/layout/Navbar.jsx`
- `src/components/ui/EmptyState.jsx`
- `src/components/ui/ErrorState.jsx`
- `src/components/ui/LoadingState.jsx`
- `src/data/README.md`
- `src/data/index.js`
- `src/pages/Home/Home.jsx`
- `src/pages/Search/Search.jsx`
- `src/pages/Testament/BookPage.jsx`
- `src/pages/Testament/ChapterPage.jsx`
- `src/pages/Testament/Testament.jsx`
- `src/pages/Testament/VersePage.jsx`
- `src/routes/AppRoutes.jsx`

## Deleted (30)

All of these were unused, literal zero-byte placeholders superseded by the active domain structure. Their absence was checked by the source-import audit and production build.

- `src/components/home/ClosingStatement.jsx`
- `src/components/home/QuestionCard.jsx`
- `src/components/home/QuestionsSection.jsx`
- `src/components/home/ReadingSection.jsx`
- `src/components/home/TestamentIntroduction.jsx`
- `src/components/search/SearchBar.jsx`
- `src/components/search/SearchFilters.jsx`
- `src/components/search/SearchResultCard.jsx`
- `src/components/search/SearchResults.jsx`
- `src/components/testament/BookHeader.jsx`
- `src/components/testament/ChapterCard.jsx`
- `src/components/testament/ChapterList.jsx`
- `src/components/testament/Clarification.jsx`
- `src/components/testament/Context.jsx`
- `src/components/testament/CrossReferences.jsx`
- `src/components/testament/Definition.jsx`
- `src/components/testament/Reflection.jsx`
- `src/components/testament/RelatedVerses.jsx`
- `src/components/testament/TestamentNavigation.jsx`
- `src/components/testament/Verse.jsx`
- `src/components/testament/VerseCard.jsx`
- `src/components/testament/VerseReader.jsx`
- `src/hooks/useBooks.js`
- `src/hooks/useChapters.js`
- `src/hooks/useSearch.js`
- `src/hooks/useVerses.js`
- `src/services/api.js`
- `src/services/search.service.js`
- `src/services/testament.service.js`
- `src/utils/searchContent.js`

## Preserved

The pre-migration snapshot verified 35 hashes covering the original three moved content fixtures, other unchanged editorial data, CSS, Tailwind, document metadata, branding, Button/PageContainer, legal pages, and public/image assets. The complete rendered home text matches the baseline after whitespace normalization. Existing CSS classes were retained on migrated sections and reader elements; no browser visual comparison was available.
