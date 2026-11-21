import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  useLocation,
  useNavigate,
  useSearchParams as useRouterSearchParams,
} from 'react-router-dom';
export { useParams } from 'react-router-dom';
const ToolNavigation = createContext<{ url: string; navigate: (url: string) => void } | null>(null);
export const useToolNavigation = () => useContext(ToolNavigation);
/** Keep authoring navigation inside DIS while sharing its theme and application lifetime. */
export function ToolNavigationProvider({
  url,
  onNavigate,
  children,
}: {
  url: string;
  onNavigate: (url: string) => void;
  children: ReactNode;
}) {
  const latestNavigate = useRef(onNavigate);
  useLayoutEffect(() => {
    latestNavigate.current = onNavigate;
  }, [onNavigate]);
  const navigate = useCallback((path: string) => latestNavigate.current(path), []);
  const value = useMemo(() => ({ url, navigate }), [url, navigate]);
  return <ToolNavigation.Provider value={value}>{children}</ToolNavigation.Provider>;
}
export function useRouter() {
  const navigate = useNavigate();
  const navigateTool = useToolNavigation()?.navigate;
  return useMemo(
    () => ({
      push: (url: string) => (navigateTool ? navigateTool(url) : navigate(url)),
      replace: (url: string) =>
        navigateTool ? navigateTool(url) : navigate(url, { replace: true }),
      back: () => navigate(-1),
      refresh: () => window.location.reload(),
    }),
    [navigate, navigateTool],
  );
}
export function usePathname() {
  const location = useLocation();
  const tool = useToolNavigation();
  return tool ? new URL(tool.url, window.location.origin).pathname : location.pathname;
}
export function useSearchParams() {
  const [params] = useRouterSearchParams();
  const tool = useToolNavigation();
  return useMemo(
    () => (tool ? new URL(tool.url, window.location.origin).searchParams : params),
    [tool, params],
  );
}
