import { useEffect, useState } from 'react';
import { describeFailure } from '../../services/api/failures';

export default function useAdminResource<T>(key: string | null, load: () => Promise<{ data: T }>) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>();
  useEffect(() => {
    if (key === null) return;
    let active = true;
    load().then(({ data }) => {
      if (active) setState({ key, data });
    }).catch((error: unknown) => {
      if (active) setState({ key, error: describeFailure(error) });
    });
    return () => { active = false; };
  }, [key, load]);
  return {
    data: state?.key === key ? state.data : undefined,
    error: state?.key === key ? state.error : undefined,
    loading: key !== null && state?.key !== key,
  };
}
