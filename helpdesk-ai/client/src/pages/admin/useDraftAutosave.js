import { useCallback, useEffect, useRef, useState } from 'react';

export function useDraftAutosave(api) {
  const record = useRef(null);
  const latest = useRef('');
  const saved = useRef('');
  const timer = useRef(null);
  const queue = useRef(Promise.resolve());
  const [status, setStatus] = useState('');
  const initialize = useCallback(value => {
    clearTimeout(timer.current);
    record.current = value;
    latest.current = saved.current = value ? JSON.stringify(value.simulation) : '';
    setStatus(value ? 'Draft saved' : '');
  }, []);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    queue.current = queue.current.catch(() => {}).then(async () => {
      while(record.current && latest.current !== saved.current) {
        const current = record.current, value = latest.current;
        setStatus('Saving draft...');
        try {
          const {data} = await api.patch(`/api/admin/simulation-drafts/${current.id}`, {version:current.version,simulation:JSON.parse(value)});
          if(record.current?.id !== current.id) return record.current;
          record.current = data.draft;
          saved.current = value;
          setStatus('Draft saved');
        } catch(error) {
          setStatus(error.response?.data?.message || 'Draft could not be saved. Keep this page open and retry.');
          throw error;
        }
      }
      return record.current;
    });
    return queue.current;
  }, [api]);
  const change = useCallback(simulation => {
    if(!record.current) return;
    latest.current = JSON.stringify(simulation);
    setStatus('Saving draft...');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {flush().catch(() => {});}, 500);
  }, [flush]);
  useEffect(() => {
    const warn = event => {if(record.current && latest.current!==saved.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);
    return () => {clearTimeout(timer.current);window.removeEventListener('beforeunload',warn);};
  }, []);
  return { initialize, change, flush, status };
}
