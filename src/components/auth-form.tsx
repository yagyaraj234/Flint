import { primaryButton } from "./ui";

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
			<label className="mb-2 block text-sm font-medium text-ink" htmlFor={id}>
				{label}
			</label>
			<input
				aria-describedby={error ? errorId : undefined}
				aria-invalid={Boolean(error)}
				autoComplete={autoComplete}
				className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition duration-150 placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/10"
				id={id}
				maxLength={maxLength}
				minLength={minLength}
				onChange={(event) => onChange(event.currentTarget.value)}
				required
				type={type}
				value={value}
			/>
			{error ? (
				<p className="mt-1.5 text-sm text-danger" id={errorId}>
					{error}
				</p>
			) : null}
		</div>
	);
}

export const authButtonClass = `${primaryButton} w-full py-3`;
