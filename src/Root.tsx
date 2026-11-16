import { useEffect } from 'react';
import App from './App';
import { useBoard } from './store/board';
import { boot, useSession } from './sync/session';
import { ToastHost } from './components/ToastHost';
import { useFocusRunner } from './focus/runner';
import { ConfirmHost } from './components/ConfirmHost';
import { TopProgress } from './components/TopProgress';
import { AuthScreen, SplashScreen } from './components/AuthScreen';

let booted = false;

/** Chọn màn hình theo trạng thái đăng nhập */
export default function Root() {
  const status = useSession((s) => s.status);
  const theme = useBoard((s) => s.theme);
  const lang = useBoard((s) => s.lang);
  const uiStyle = useBoard((s) => s.uiStyle);
  useFocusRunner();

  useEffect(() => {
    // StrictMode gọi effect hai lần khi phát triển; chỉ kiểm tra phiên một lần
    if (booted) return;
    booted = true;
    void boot();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.setAttribute('data-ui', uiStyle ?? 'glass');
  }, [uiStyle]);

  const screen =
    status === 'checking' ? <SplashScreen /> : status === 'anon' ? <AuthScreen /> : <App />;
  return (
    <>
      {screen}
      <TopProgress />
      <ToastHost />
      <ConfirmHost />
    </>
  );
}
