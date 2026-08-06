import type { ReactElement } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { ko } from 'react-day-picker/locale';

export function ServiceDateSelector({
  allowAllDates = false,
  label,
  onChange,
  serviceDate,
}: {
  allowAllDates?: boolean;
  label: string;
  onChange: (serviceDate?: string) => void;
  serviceDate?: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const calendarId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const today = todayInSeoul();
  const calendarDate = serviceDate ?? today;

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('touchstart', closeOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('touchstart', closeOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="control-date-selector" ref={containerRef}>
      <button
        aria-controls={calendarId}
        aria-expanded={open}
        aria-label={`${label} 날짜 변경`}
        className="control-date-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="control-date-picker-icon"><CalendarDays aria-hidden="true" /></span>
        <span className="control-date-picker-copy">
          <small>{label}</small>
          <strong>{serviceDate === undefined ? '전체 기간' : formatServiceDate(serviceDate)}</strong>
        </span>
        <span className="control-date-picker-action">변경<ChevronDown aria-hidden="true" /></span>
      </button>
      {open ? (
        <div className="control-calendar-popover" id={calendarId}>
          <DayPicker
            defaultMonth={serviceDateToDate(calendarDate)}
            disabled={{ after: serviceDateToDate(today) }}
            endMonth={serviceDateToDate(today)}
            fixedWeeks
            locale={ko}
            mode="single"
            navLayout="around"
            onSelect={(date) => {
              if (!date) return;
              onChange(dateToServiceDate(date));
              setOpen(false);
            }}
            selected={serviceDate === undefined ? undefined : serviceDateToDate(serviceDate)}
            showOutsideDays
          />
          {allowAllDates ? (
            <button
              className="control-calendar-clear"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              type="button"
            >전체 기간</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
  }).format(new Date());
}

function formatServiceDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${year}. ${month}. ${day}.` : value;
}

function serviceDateToDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateToServiceDate(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}
