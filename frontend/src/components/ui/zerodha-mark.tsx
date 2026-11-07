import { useState } from 'react';
import { Landmark } from 'lucide-react';

export function ZerodhaMark() {
  const [faviconAvailable, setFaviconAvailable] = useState(true);
  return <span className="zerodha-mark" aria-hidden="true">
    {faviconAvailable
      ? <img src="https://kite.zerodha.com/favicon.ico" alt="" onError={() => setFaviconAvailable(false)} />
      : <Landmark size={16} />}
  </span>;
}
