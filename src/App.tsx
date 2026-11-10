import { AppShell, Container, Overlay, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ExportDialog } from './components/layout/ExportDialog';
import { TopBar } from './components/layout/TopBar';
import topBarClasses from './components/layout/TopBar.module.css';
import { he } from './i18n/he';
import { useScenarioActions } from './io/useScenarioActions';
import { PlanPage } from './pages/PlanPage';
import { TrackingPage } from './pages/TrackingPage';

/** גרירת קובץ תרחיש לכל מקום בחלון פותחת אותו. */
function useFileDrop() {
  const { openFile } = useScenarioActions();
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) openFile(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [openFile]);
  return dragging;
}

function Shell() {
  const dragging = useFileDrop();
  return (
    <AppShell header={{ height: 'auto' }} padding="md">
      <AppShell.Header pos={{ base: "static", sm: "sticky" }}>
        <TopBar />
      </AppShell.Header>
      <AppShell.Main pt="md" className={topBarClasses.page}>
        <Container size="xl" px={0}>
          <Routes>
            <Route path="/plan" element={<PlanPage />} />
            {/* הכתובות הישנות של מסכי הביקוש וההיצע מפנות לדף התכנון המשולב */}
            <Route path="/demand" element={<Navigate to="/plan" replace />} />
            <Route path="/supply" element={<Navigate to="/plan" replace />} />
            <Route path="/tracking" element={<TrackingPage />} />
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

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
