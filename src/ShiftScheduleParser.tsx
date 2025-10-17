import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Calendar, Clock, Loader2, AlertCircle } from 'lucide-react';

interface ShiftEntry {
  date: string;
  weekday: string;
  startTime: string;
  endTime: string;
  duration?: string;
  notes?: string;
  type?: 'shift' | 'free' | 'vacation' | 'sick';
}

interface ParsedSchedule {
  employeeName?: string;
  shifts: ShiftEntry[];
}

export default function ShiftScheduleParser() {
  const [employeeName, setEmployeeName] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState<ParsedSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result as string;
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Please select a valid PDF file');
      setFile(null);
    }
  };

  const parseSchedule = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setSchedule(null);

    try {
      const base64PDF = await convertFileToBase64(file);

      const systemPrompt = `You are a shift schedule extraction assistant. Analyze the provided PDF document and extract shift information ONLY for the employee named "${employeeName}".

CRITICAL INSTRUCTIONS:
1. Search ONLY for shifts belonging to "${employeeName}" (case-insensitive, partial matches allowed)
2. IGNORE all other employees' schedules
3. Extract dates in YYYY-MM-DD format
4. Calculate and add the weekday name for each date (Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag, Sonntag)
5. Recognize various time formats:
   - "08:00-16:00" or "08:00 - 16:00"
   - "8-16" or "8:00-16:00"
   - "0800-1600"
   - Time ranges with breaks: "08:00-12:00, 13:00-17:00"
6. Recognize special days:
   - Free days: "-", " ", "*" or blank → type: "free"
   - Vacation: "J" or "Urlaub" → type: "vacation"
   - Sick leave: "/" or "Krank" → type: "sick"
7. Calculate total work duration if possible
8. Extract any notes, locations, or special remarks
9. Organize shifts chronologically by date

Return the data in the following JSON format:
{
  "employeeName": "${employeeName}",
  "shifts": [
    {
      "date": "YYYY-MM-DD",
      "weekday": "Montag",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "duration": "X Stunden",
      "type": "shift",
      "notes": "Besondere Hinweise"
    }
  ]
}

For free days, vacation, and sick leave, use startTime and endTime as empty strings or "-":
{
  "date": "YYYY-MM-DD",
  "weekday": "Montag",
  "startTime": "-",
  "endTime": "-",
  "type": "free",
  "notes": "Frei"
}

If no shifts are found for "${employeeName}", return:
{
  "employeeName": "${employeeName}",
  "shifts": [],
  "error": "Keine Schichten für diesen Mitarbeiter gefunden"
}

Be thorough and check all pages of the document.`;

      const response = await fetch('https://llm.blackbox.ai/chat/completions', {
        method: 'POST',
        headers: {
          'customerId': 'cus_SSL2gUr2U1mPfy',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer xxx'
        },
        body: JSON.stringify({
          model: 'openrouter/claude-sonnet-4',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Bitte extrahiere und organisiere NUR die Schichtinformationen für den Mitarbeiter "${employeeName}" aus diesem PDF-Dokument. Beachte auch freie Tage, Urlaub (J), Krankheit (/) und andere Abwesenheitsarten. Ignoriere alle anderen Mitarbeiter.`
                },
                {
                  type: 'file',
                  file: {
                    filename: file.name,
                    file_data: base64PDF
                  }
                }
              ]
            }
          ]
        }),
        signal: AbortSignal.timeout(300000)
      });

      if (!response.ok) {
        throw new Error(`Failed to parse PDF: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No response from AI');
      }

      const jsonMatch = content.match(/
