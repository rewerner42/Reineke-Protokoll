import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell.js';
import { MeetingListPage } from './pages/MeetingListPage.js';
import { RecordingPage } from './pages/RecordingPage.js';
import { MeetingDetailPage } from './pages/MeetingDetailPage.js';
import { ProtocolPage } from './pages/ProtocolPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/meetings" replace /> },
      { path: 'meetings', element: <MeetingListPage /> },
      { path: 'meetings/:id', element: <MeetingDetailPage /> },
      { path: 'meetings/:id/protocol', element: <ProtocolPage /> },
      { path: 'record', element: <RecordingPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
