"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseDraftPersistenceOptions<T> {
  key: string;
  initialData: T;
  debounceMs?: number;
}

export function useDraftPersistence<T extends object>({
  key,
  initialData,
  debounceMs = 500,
}: UseDraftPersistenceOptions<T>) {
  const [data, setData] = useState<T>(initialData);
  const [isDirty, setIsDirty] = useState(false);
  const [hasRecoveredDraft, setHasRecoveredDraft] = useState(false);
  const initialDataRef = useRef(initialData);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDirtyRef = useRef(false);

  const storageKey = `draft_${key}`;

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as T;
        const hasChanges = JSON.stringify(parsed) !== JSON.stringify(initialData);
        if (hasChanges) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setData(parsed);
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setIsDirty(true);
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setHasRecoveredDraft(true);
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, initialData]);

  const saveDraft = useCallback(
    (newData: T) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        try {
          const hasChanges = JSON.stringify(newData) !== JSON.stringify(initialDataRef.current);
          if (hasChanges) {
            localStorage.setItem(storageKey, JSON.stringify(newData));
          } else {
            localStorage.removeItem(storageKey);
          }
        } catch {
        }
      }, debounceMs);
    },
    [storageKey, debounceMs]
  );

  const updateField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setData((prev) => {
        const newData = { ...prev, [field]: value };
        setIsDirty(JSON.stringify(newData) !== JSON.stringify(initialDataRef.current));
        saveDraft(newData);
        return newData;
      });
    },
    [saveDraft]
  );

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
    }
    setIsDirty(false);
    setHasRecoveredDraft(false);
  }, [storageKey]);

  const discardDraft = useCallback(() => {
    setData(initialDataRef.current);
    clearDraft();
  }, [clearDraft]);

  const resetToServer = useCallback((serverData: T) => {
    initialDataRef.current = serverData;
    setData(serverData);
    clearDraft();
  }, [clearDraft]);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Du har ulagrede endringer. Er du sikker på at du vil forlate siden?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!isDirtyRef.current) return;
      
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      
      if (anchor && anchor.href && !anchor.href.startsWith("javascript:")) {
        const currentUrl = new URL(window.location.href);
        const targetUrl = new URL(anchor.href, window.location.origin);
        
        if (currentUrl.pathname !== targetUrl.pathname) {
          const confirmed = window.confirm(
            "Du har ulagrede endringer. Er du sikker på at du vil forlate siden?"
          );
          
          if (!confirmed) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return {
    data,
    setData,
    updateField,
    isDirty,
    hasRecoveredDraft,
    clearDraft,
    discardDraft,
    resetToServer,
  };
}
