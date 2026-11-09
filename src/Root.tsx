import { useEffect } from 'react';
import App from './App';
import { useBoard } from './store/board';
import { boot, useSession } from './sync/session';
import { AuthScreen, ChooseScreen, SplashScreen } from './components/AuthScreen';

let booted = false;

/** Chọn màn hình theo trạng thái đăng nhập */
export default function Root() {
  const status = useSession((s) => s.status);
  const theme = useBoard((s) => s.theme);
  const lang = useBoard((s) => s.lang);

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

  if (status === 'checking') return <SplashScreen />;
  if (status === 'anon') return <AuthScreen />;
  if (status === 'choose') return <ChooseScreen />;
  return <App />;
}
