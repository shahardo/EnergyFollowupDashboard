import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { createTheme, DirectionProvider, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const theme = createTheme({
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  primaryColor: 'teal',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DirectionProvider initialDirection="rtl">
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <Notifications position="bottom-left" />
        <App />
      </MantineProvider>
    </DirectionProvider>
  </StrictMode>,
);
