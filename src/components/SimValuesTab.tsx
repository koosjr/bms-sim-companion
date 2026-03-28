import type { AppState } from '../types';

interface Props {
  state: AppState;
  onUpdate: (p: Partial<AppState>) => void;
  onNext: () => void;
}

export default function SimValuesTab({ onNext }: Props) {
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Sim Values</h2>
      <button onClick={onNext}>Next →</button>
    </div>
  );
}
