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
4. Calculate and add the weekday name for each date (Monday, Tuesday, Wednesday, etc.)
5. Recognize various time formats:
   - "08:00-16:00" or "08:00 - 16:00"
   - "8-16" or "8:00-16:00"
   - "0800-1600"
   - Time ranges with breaks: "08:00-12:00, 13:00-17:00"
6. Calculate total work duration if possible
7. Extract any notes, locations, or special remarks
8. Organize shifts chronologically by date

Return the data in the following JSON format:
{
  "employeeName": "${employeeName}",
  "shifts": [
    {
      "date": "YYYY-MM-DD",
      "weekday": "Monday",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "duration": "X hours",
      "notes": "Any special notes, location, or break information"
    }
  ]
}

If no shifts are found for "${employeeName}", return:
{
  "employeeName": "${employeeName}",
  "shifts": [],
  "error": "No shifts found for this employee"
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
                  text: `Please extract and organize ONLY the shift information for the employee "${employeeName}" from this PDF document. Make sure to include the weekday for each date. Ignore all other employees.`
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

      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1].trim() : content.trim();
      const parsedSchedule: ParsedSchedule = JSON.parse(jsonString);

      if (parsedSchedule.shifts.length === 0) {
        setError(`Keine Schichten für "${employeeName}" gefunden. Bitte überprüfe den Namen und versuche es erneut.`);
        setSchedule(null);
      } else {
        setSchedule(parsedSchedule);
      }
    } catch (err) {
      console.error('Error parsing schedule:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse PDF. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('de-DE', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Shift Schedule Parser</h1>
          <p className="text-muted-foreground">
            Upload your PDF shift schedule and get a clean, organized overview with weekdays
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Mitarbeiter & PDF hochladen
            </CardTitle>
            <CardDescription>
              Gib deinen Namen ein und wähle die PDF-Datei mit den Schichtplänen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <label htmlFor="employee-name" className="text-sm font-medium text-foreground">
                  Mitarbeitername
                </label>
                <input
                  id="employee-name"
                  type="text"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="z.B. Max Mustermann"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="flex-1 text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                />
                <Button
                  onClick={parseSchedule}
                  disabled={!file || !employeeName.trim() || loading}
                  className="min-w-[120px]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analysiere...
                    </>
                  ) : (
                    'Schichten extrahieren'
                  )}
                </Button>
              </div>

              {file && (
                <div className="text-sm text-muted-foreground">
                  Selected: {file.name}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {schedule && schedule.shifts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Deine Schichten
              </CardTitle>
              {schedule.employeeName && (
                <CardDescription>Schichtplan für {schedule.employeeName}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {schedule.shifts.map((shift, index) => (
                  <div
                    key={index}
                    className="border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-foreground">
                            {formatDate(shift.date)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ({shift.weekday})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                          <Clock className="w-4 h-4" />
                          <span>
                            {shift.startTime} - {shift.endTime}
                          </span>
                          {shift.duration && (
                            <span className="text-xs bg-muted px-2 py-1 rounded">
                              {shift.duration}
                            </span>
                          )}
                        </div>
                      </div>
                      {shift.notes && (
                        <div className="text-sm text-muted-foreground italic ml-6 md:ml-0">
                          {shift.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {loading && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <p className="text-muted-foreground">
                  Analysiere PDF und extrahiere Schichten für {employeeName}...
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
