import { useCallback, useRef, useState } from "react";
import { dirname } from "../utils/format";

export function useHistory(initialPath: string, sep: string) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const backStack = useRef<string[]>([]);
  const forwardStack = useRef<string[]>([]);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const navigate = useCallback((path: string) => {
    setCurrentPath((prev) => {
      if (prev === path) return prev;
      backStack.current.push(prev);
      forwardStack.current = [];
      setCanGoBack(true);
      setCanGoForward(false);
      return path;
    });
  }, []);

  const goBack = useCallback(() => {
    setCurrentPath((prev) => {
      const target = backStack.current.pop();
      if (target === undefined) return prev;
      forwardStack.current.push(prev);
      setCanGoBack(backStack.current.length > 0);
      setCanGoForward(true);
      return target;
    });
  }, []);

  const goForward = useCallback(() => {
    setCurrentPath((prev) => {
      const target = forwardStack.current.pop();
      if (target === undefined) return prev;
      backStack.current.push(prev);
      setCanGoForward(forwardStack.current.length > 0);
      setCanGoBack(true);
      return target;
    });
  }, []);

  const goUp = useCallback(() => {
    setCurrentPath((prev) => {
      const parent = dirname(prev, sep);
      if (parent === prev) return prev;
      backStack.current.push(prev);
      forwardStack.current = [];
      setCanGoBack(true);
      setCanGoForward(false);
      return parent;
    });
  }, [sep]);

  const initialize = useCallback((path: string) => {
    backStack.current = [];
    forwardStack.current = [];
    setCanGoBack(false);
    setCanGoForward(false);
    setCurrentPath(path);
  }, []);

  return { currentPath, navigate, goBack, goForward, goUp, initialize, canGoBack, canGoForward };
}
