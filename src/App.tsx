import { AppShell, Container, Overlay, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ExportDialog } from './components/layout/ExportDialog';
import { TopBar } from './components/layout/TopBar';
import topBarClasses from './components/layout/TopBar.module.css';
import { he } from './i18n/he';
import { useScenarioActions } from './io/useScenarioActions';
import { PlanPage } from './pages/PlanPage';
import { PriorityPage } from './pages/PriorityPage';
import { ScenarioPlanPage } from './pages/ScenarioPlanPage';
import { TrackingPage } from './pages/TrackingPage';
import { TrilemmaPage } from './pages/TrilemmaPage';

/**
 * גרירת קובץ תרחיש לכל מקום בחלון פותחת אותו. מחזיר true בזמן גרירה (לשכבת "שחררו כאן").
 * סופרים כניסות ויציאות (dragenter / dragleave) במקום לבדוק relatedTarget, שבספארי תמיד null.
 */
function useFileDrop() {
  const { openFile } = useScenarioActions();
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    // בלי preventDefault ב-dragover הדפדפן לא מאפשר שחרור.
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) openFile(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [openFile]);
  return dragging;
}

/** מסגרת האפליקציה: הסרגל העליון, הדפים לפי הנתיב, חלון הייצוא ושכבת הגרירה. */
function Shell() {
  const dragging = useFileDrop();
  return (
    <AppShell header={{ height: 'auto' }} padding="md">
      <AppShell.Header pos={{ base: 'static', sm: 'sticky' }}>
        <TopBar />
      </AppShell.Header>
      <AppShell.Main pt="md" className={topBarClasses.page}>
        <Container size="xl" px={0}>
          <Routes>
            <Route path="/plan" element={<PlanPage />} />
            {/* הכתובות הישנות של מסכי הביקוש וההיצע מפנות לדף התכנון המשולב */}
            <Route path="/demand" element={<Navigate to="/plan" replace />} />
            <Route path="/supply" element={<Navigate to="/plan" replace />} />
            <Route path="/scenarios" element={<ScenarioPlanPage />} />
            <Route path="/priority" element={<PriorityPage />} />
            <Route path="/tracking" element={<TrackingPage />} />
            <Route path="/trilemma" element={<TrilemmaPage />} />
            <Route path="/pyramid" element={<TrilemmaPage pyramid />} />
            <Route path="*" element={<Navigate to="/plan" replace />} />
          </Routes>
        </Container>
      </AppShell.Main>
      <ExportDialog />
      {dragging && (
        <Overlay fixed center backgroundOpacity={0.5} blur={2} zIndex={500}>
          <Text c="white" fz="xl" fw={700}>
            {he.files.dropHint}
          </Text>
        </Overlay>
      )}
    </AppShell>
  );
}

/** שורש האפליקציה: נתיבים ב-hash (עובד גם מקובץ סטטי וגם בתוך iframe). */
export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
