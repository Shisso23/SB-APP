import React, { useId } from 'react';

export const accountInput = 'mt-1 min-h-[44px] w-full rounded-lg border border-slate-500 bg-[#0d1626] px-3 py-2.5 text-base text-white placeholder:text-slate-400';

const PhoneField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-slate-100">Phone number <span className="font-normal text-slate-300">(optional)</span></label>
      <input id={id} name="tel" type="tel" autoComplete="tel" aria-describedby={id + '-help'}
        placeholder="082 123 4567 or +44 …" value={value} maxLength={64} disabled={disabled}
        onChange={event => onChange(event.target.value)} className={accountInput} />
      <p id={id + '-help'} className="mt-1.5 text-xs leading-relaxed text-slate-300">
        South Africa (+27) by default. For other countries, include the calling code. Your number is saved as unverified contact information. Promotional SMS and WhatsApp require separate consent.
      </p>
    </div>
  );
};

export default PhoneField;
