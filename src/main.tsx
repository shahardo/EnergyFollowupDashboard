import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { createTheme, DirectionProvider, MantineProvider, Slider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import sliderClasses from './components/controls/Slider.module.css';

// כשהדף עטוף במסמך אחר (Artifact), ה-<html> שלו לא נושא dir ו-lang, ולכן קובעים אותם כאן.
document.documentElement.dir = 'rtl';
document.documentElement.lang = 'he';

// בחירת ערכת נושא מפורשת של המארח (data-theme על <html>) גוברת על הגדרת המערכת.
const hostTheme = document.documentElement.getAttribute('data-theme');
const forced = hostTheme === 'dark' || hostTheme === 'light' ? hostTheme : undefined;

const theme = createTheme({
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  primaryColor: 'teal',
  components: {
    // סגנון אחיד לכל הסליידרים באפליקציה.
    Slider: Slider.extend({ classNames: sliderClasses }),
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DirectionProvider initialDirection="rtl">
      <MantineProvider theme={theme} defaultColorScheme="auto" forceColorScheme={forced}>
        <Notifications position="bottom-left" />
        <App />
      </MantineProvider>
    </DirectionProvider>
  </StrictMode>,
);
