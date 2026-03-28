import type { AppState } from '../types';

interface Props {
  state: AppState;
  onUpdate: (p: Partial<AppState>) => void;
}

export default function GenerateTab(_: Props) {
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Generate</h2>
      <p>Coming soon.</p>
    </div>
  );
}
