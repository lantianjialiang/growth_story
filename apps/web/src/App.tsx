import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSession } from './lib/queries';
import { LoginPage } from './routes/LoginPage';
import { RegisterPage } from './routes/RegisterPage';
import { ProfilesPage } from './routes/ProfilesPage';
import { TimelinePage } from './routes/TimelinePage';
import { GalleryPage } from './routes/GalleryPage';
import { TrashPage } from './routes/TrashPage';
import { EventPage } from './routes/EventPage';
import { ManagePage } from './routes/ManagePage';
import { SettingsPage } from './routes/SettingsPage';
import { UsersPage } from './routes/UsersPage';
import { PublicPage } from './routes/PublicPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { LeafIcon, Spinner } from './components/ui';

function FullPageLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper text-muted">
      <span className="text-accent">
        <LeafIcon className="h-8 w-8" />
      </span>
      <Spinner className="h-4 w-4" />
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isLoading) return <FullPageLoader />;
  if (!session.data?.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/s/:token" element={<PublicPage />} />
      <Route path="/s/:token/e/:eventId" element={<PublicPage />} />

      <Route
        path="/"
        element={
          <Protected>
            <ProfilesPage />
          </Protected>
        }
      />
      <Route
        path="/p/:profileId"
        element={
          <Protected>
            <TimelinePage />
          </Protected>
        }
      />
      <Route
        path="/p/:profileId/gallery"
        element={
          <Protected>
            <GalleryPage />
          </Protected>
        }
      />
      <Route
        path="/p/:profileId/e/:eventId"
        element={
          <Protected>
            <EventPage />
          </Protected>
        }
      />
      <Route
        path="/p/:profileId/manage"
        element={
          <Protected>
            <ManagePage />
          </Protected>
        }
      />
      <Route
        path="/trash"
        element={
          <Protected>
            <TrashPage />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <SettingsPage />
          </Protected>
        }
      />
      <Route
        path="/users"
        element={
          <Protected>
            <UsersPage />
          </Protected>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
