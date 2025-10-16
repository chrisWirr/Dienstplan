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
}

interface ParsedSchedule {
  employeeName?: string;
  shifts: ShiftEntry[];
}

export default function ShiftScheduleParser() {
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

      const systemPrompt = `You are a shift schedule extraction assistant. Analyze the provided PDF document and extract shift information for the user.

Instructions:
1. Extract all shift entries with dates, times, and any relevant details
2. Calculate and add the weekday name for each date (Monday, Tuesday, Wednesday, etc.)
3. Organize shifts chronologically by date
4. Include shift start time, end time, and duration if available
5. Extract any notes or special information about shifts

Return the data in the following JSON format:
{
  "employeeName": "Name if found in document",
  "shifts": [
    {
      "date": "YYYY-MM-DD",
      "weekday": "Monday",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "duration": "X hours",
      "notes": "Any special notes"
    }
  ]
}

Be thorough and extract all shift information from the document, even if it spans multiple pages.`;

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
                  text: 'Please extract and organize all shift information from this PDF document. Make sure to include the weekday for each date.'
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
        signal: AbortSignal.timeout(300000) // 5 minute timeout
      });

      if (!response.ok) {
        throw new Error(`Failed to parse PDF: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No response from AI');
      }

      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/
