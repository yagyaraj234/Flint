interface AuthFieldProps {
	autoComplete: string;
	error?: string | null;
	id: string;
	label: string;
	maxLength?: number;
	minLength?: number;
	onChange: (value: string) => void;
	type: "email" | "password";
	value: string;
}

export function AuthField({
	autoComplete,
	error,
	id,
	label,
	maxLength,
	minLength,
	onChange,
	type,
	value,
}: AuthFieldProps) {
	const errorId = `${id}-error`;

	return (
		<div>
			<label className="mb-2 block text-sm font-medium" htmlFor={id}>
				{label}
			</label>
			<input
				aria-describedby={error ? errorId : undefined}
				aria-invalid={Boolean(error)}
				autoComplete={autoComplete}
				className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--surface,#fff)] px-4 py-3 outline-none focus:border-[var(--ember,#ff4d00)]"
				id={id}
				maxLength={maxLength}
				minLength={minLength}
				onChange={(event) => onChange(event.currentTarget.value)}
				required
				type={type}
				value={value}
			/>
			{error ? (
				<p className="mt-1 text-sm text-[var(--ember,#ff4d00)]" id={errorId}>
					{error}
				</p>
			) : null}
		</div>
	);
}

export const authButtonClass =
	"w-full rounded-full bg-[var(--ember,#ff4d00)] px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60";
