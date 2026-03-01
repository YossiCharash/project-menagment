interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<string, string> = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

export default function Spinner({ size = 'md' }: SpinnerProps) {
  return (
    <div className="flex justify-center items-center py-8">
      <div
        className={`${SIZE_CLASSES[size]} animate-spin rounded-full border-4 border-gray-200 border-t-blue-600`}
      />
    </div>
  );
}
