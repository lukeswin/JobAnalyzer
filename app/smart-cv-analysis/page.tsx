"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, FileText, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"

// Import PDF.js and Tesseract
import * as pdfjsLib from 'pdfjs-dist'
import 'pdfjs-dist/build/pdf.worker.entry'
import { createWorker, PSM } from 'tesseract.js'

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

export default function SmartCVAnalysis() {
  const [file, setFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<string | null>(null)
  const [analysisResults, setAnalysisResults] = useState<any>(null)
  const router = useRouter()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile)
      setError(null)
    } else {
      setError("Please upload a PDF file")
      setFile(null)
    }
  }

  const extractTextFromPDF = async (pdfFile: File): Promise<string> => {
    const arrayBuffer = await pdfFile.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    let fullText = ''

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1.0 })
      
      // Get text content with positions
      const textContent = await page.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
        includeMarkedContent: true,
        textContent: {
          includeMarkedContent: true,
          includeMarkedContentText: true,
          includeMarkedContentGraphics: true,
          includeMarkedContentAnnotations: true
        }
      } as any)

      console.log('Raw text items:', textContent.items.length)

      // Group text items by their y-position first to maintain reading order
      const lineThreshold = 8
      const lineGroups: any[][] = []
      
      // Sort items by y position (top to bottom) and x position (left to right)
      const sortedItems = textContent.items
        .map((item: any) => ({
          ...item,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width || 0,
          height: item.height || 0
        }))
        .sort((a: any, b: any) => {
          const yDiff = Math.abs(a.y - b.y)
          if (yDiff <= lineThreshold) {
            // If items are on the same line, sort by x position
            return a.x - b.x
          }
          // Sort by y position (top to bottom)
          return b.y - a.y
        })

      // Group items into lines with improved logic
      let currentLine: any[] = []
      let currentY = sortedItems[0]?.y

      sortedItems.forEach((item: any) => {
        const yDiff = Math.abs(item.y - currentY)
        const isSameLine = yDiff <= lineThreshold
        
        if (isSameLine) {
          currentLine.push(item)
        } else {
          if (currentLine.length > 0) {
            lineGroups.push(currentLine)
          }
          currentLine = [item]
          currentY = item.y
        }
      })
      if (currentLine.length > 0) {
        lineGroups.push(currentLine)
      }

      // Process lines into text while preserving structure
      let pageText = ''
      let lastLineY: number | null = null

      lineGroups.forEach((line, lineIndex) => {
        // Check for significant gaps between lines that might indicate section breaks
        if (lastLineY !== null) {
          const currentLineY = line[0].y
          const gap = Math.abs(currentLineY - lastLineY)
          if (gap > 25) { // Increased gap threshold for better section detection
            pageText += '\n\n'
          }
        }
        lastLineY = line[0].y

        // Sort items within the line by x position to ensure correct reading order
        const sortedLine = line.sort((a: any, b: any) => a.x - b.x)
        
        const lineText = sortedLine
          .map((item: any) => {
            // Add space between items if they're not too close
            const prevItem = sortedLine[sortedLine.indexOf(item) - 1]
            const spaceNeeded = prevItem && (item.x - (prevItem.x + prevItem.width)) > 2
            return (spaceNeeded ? ' ' : '') + item.str
          })
          .join('')
          .trim()

        if (lineText) {
          pageText += lineText + '\n'
        }
      })

      pageText = pageText
        .replace(/\n\s*\n/g, '\n\n')
        .replace(/\s+/g, ' ')
        .trim()

      console.log('Extracted text structure:', 
        pageText.split('\n').slice(0, 5).map(line => line.substring(0, 50))
      )

      let finalText = pageText

      // If no text was extracted or text is too short, try OCR
      if (!pageText.trim() || pageText.length < 100) {
        console.log('No text extracted, falling back to OCR')
        // Get page as canvas with higher resolution
        const viewport = page.getViewport({ scale: 2.0 })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('Could not get canvas context')
        }

        // Set high resolution
        const pixelRatio = window.devicePixelRatio || 1
        canvas.height = viewport.height * pixelRatio
        canvas.width = viewport.width * pixelRatio
        canvas.style.width = viewport.width + 'px'
        canvas.style.height = viewport.height + 'px'
        
        // Scale context for retina/high DPI displays
        context.scale(pixelRatio, pixelRatio)
        
        // Configure rendering for best OCR results
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          enableWebGL: true,
          renderInteractiveForms: true
        }
        
        await page.render(renderContext).promise

        try {
          // Initialize Tesseract worker with better configuration for column detection
          const worker = await createWorker('eng')
          await worker.setParameters({
            tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?@#$%&*()[]{}:;"\'/-_\n ',
            preserve_interword_spaces: '1',
            textord_heavy_nr: '1',
            language_model_penalty_non_freq_dict_word: '0.5',
            tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
            textord_tablefind_recognize_tables: '1',
            textord_min_linesize: '2.0'
          } as any)
          
          console.log('Starting OCR process with column detection...')
          
          // First pass: detect page layout and potential columns
          const { data: layoutData } = await worker.recognize(canvas.toDataURL('image/png'))

          // Get page dimensions
          const pageWidth = canvas.width
          const pageHeight = canvas.height

          interface OCRLine {
            bbox: {
              x0: number;
              x1: number;
              y0: number;
              y1: number;
            };
          }

          // Analyze text positions to detect columns
          const lines = (layoutData as any).lines || [] as OCRLine[]
          const xPositions = lines.map((line: OCRLine) => line.bbox.x0)
          
          // Find potential column boundaries using x-positions clustering
          const xClusters: number[] = []
          const clusterThreshold = pageWidth * 0.15 // 15% of page width
          
          xPositions.sort((a: number, b: number) => a - b).forEach((x: number) => {
            if (!xClusters.some(cluster => Math.abs(cluster - x) < clusterThreshold)) {
              xClusters.push(x)
            }
          })

          // If multiple columns detected, process each column separately
          if (xClusters.length > 1) {
            console.log(`Detected ${xClusters.length} potential columns`)
            const columnTexts: string[] = []

            // Process each column
            for (let i = 0; i < xClusters.length; i++) {
              const startX = xClusters[i]
              const endX = xClusters[i + 1] || pageWidth
              
              // Create a canvas for this column
              const columnCanvas = document.createElement('canvas')
              const columnCtx = columnCanvas.getContext('2d')
              if (!columnCtx) {
                console.warn('Could not get column canvas context')
                continue
              }

              // Set column canvas dimensions
              columnCanvas.width = endX - startX
              columnCanvas.height = pageHeight

              // Copy this column's portion from the main canvas
              columnCtx.drawImage(
                canvas,
                startX, 0, endX - startX, pageHeight,
                0, 0, endX - startX, pageHeight
              )

              try {
                // OCR this column
                const { data: columnData } = await worker.recognize(columnCanvas.toDataURL('image/png'))
                if (columnData && columnData.text) {
                  columnTexts.push(columnData.text)
                } else {
                  console.warn('No text extracted from column', i)
                }
              } catch (columnError) {
                console.error('Error processing column', i, columnError)
                // Continue with other columns even if one fails
              }
            }

            // Combine column texts with proper spacing
            pageText = columnTexts
              .map(text => text.trim())
              .filter(text => text.length > 0)
              .join('\n\n')
          } else {
            // Single column - process normally
            try {
              const { data: { text } } = await worker.recognize(canvas.toDataURL('image/png'))
              if (text) {
                pageText = text
              } else {
                console.warn('No text extracted from single column')
              }
            } catch (singleColumnError) {
              console.error('Error processing single column:', singleColumnError)
              throw new Error('Failed to process single column OCR')
            }
          }

          // Terminate worker
          await worker.terminate()
          
          // Process OCR text similar to regular text
          const commonHeadings = [
            'Summary', 'Experience', 'Education', 'Skills', 'Achievements',
            'Strengths', 'Contact', 'Profile', 'Objective', 'Work Experience',
            'Projects', 'Certifications', 'Languages', 'Interests', 'My Life Philosophy',
            'Work History', 'Professional Experience', 'Technical Skills', 'Employment History',
            'Qualifications', 'Expertise', 'Professional Summary', 'Career Objective',
            'About Me', 'Background', 'Work', 'Personal Details', 'References'
          ].map(h => h.toLowerCase())

          // Clean and process the OCR text
          pageText = pageText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
              const cleanLine = line
                .replace(/[|]/g, '')
                .replace(/^\s*[-_•●■]\s*/, '')
                .replace(/\s+/g, ' ')
                .trim()

              if (!cleanLine) return ''

              const normalizedLine = cleanLine.toLowerCase()
              
              const hasCommonHeading = commonHeadings.some(heading => 
                normalizedLine === heading ||
                normalizedLine.startsWith(heading + ':') ||
                normalizedLine.startsWith(heading + ' -') ||
                (heading.includes(' ') && normalizedLine.includes(heading))
              )

              const isStandalonePhrase = cleanLine.length <= 35
              const hasNoEndPunctuation = !/[.!?]$/.test(cleanLine)
              const startsNewSection = /^(\d+\.?\s|[A-Z][a-z]+:)/.test(cleanLine)
              const followedByDetails = cleanLine.endsWith(':')

              const isLikelyHeading = hasCommonHeading || 
                (isStandalonePhrase && (startsNewSection || followedByDetails || hasNoEndPunctuation))

              if (isLikelyHeading) {
                return `\n\n${cleanLine}\n`
              }

              return cleanLine
            })
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\s+/g, ' ')
            .trim()

          console.log('Processed OCR text:', pageText.substring(0, 100) + '...')
        } catch (error) {
          console.error('OCR failed:', error)
          // Don't throw error, just return empty string to fall back to regular text extraction
          return ''
        }
      }

      // Add the page text to the full text with a page break
      fullText += pageText + '\n\n'
    }

    return fullText.trim()
  }

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Extract text from PDF using the existing method
      const text = await extractTextFromPDF(file)
      console.log('Extracted text before setting state:', text)
      setExtractedText(text)

      // Send the extracted text to the backend for spaCy analysis
      let response
      try {
        response = await fetch('http://localhost:8000/analyze-cv', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        })

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`)
        }
      } catch (fetchError) {
        if (fetchError instanceof TypeError && fetchError.message === 'Failed to fetch') {
          throw new TypeError('Could not connect to the analysis server. Please make sure the server is running on http://localhost:8000')
        }
        throw fetchError
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to analyze CV')
      }

      // Store both the extracted text and analysis results
      setAnalysisResults(data.data)
      localStorage.setItem("cvData", JSON.stringify({
        text: text,
        analysis: data.data
      }))
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : "Failed to analyze CV. Please try again."
      
      setError(errorMessage)
      console.error('Upload error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Add useEffect to debug state changes
  useEffect(() => {
    console.log('extractedText state changed:', extractedText)
  }, [extractedText])

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-primary p-1.5">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <Link href="/" className="text-xl font-bold">
              JobInsight AI
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/#features" className="text-sm font-medium hover:text-primary">
              Features
            </Link>
            <Link href="/#testimonials" className="text-sm font-medium hover:text-primary">
              Testimonials
            </Link>
            <Link href="/#pricing" className="text-sm font-medium hover:text-primary">
              Pricing
            </Link>
            <Link href="/#contact" className="text-sm font-medium hover:text-primary">
              Contact
            </Link>
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-primary text-primary-foreground hover:bg-primary/90">
                    AI Tools
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[200px] gap-3 p-4">
                      <li>
                        <NavigationMenuLink asChild>
                          <Link
                            href="/smart-cv-analysis"
                            className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="text-sm font-medium leading-none">Smart CV Analysis</div>
                            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                              Analyze your CV with AI
                            </p>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                      <li>
                        <NavigationMenuLink asChild>
                          <Link
                            href="/job-recommender"
                            className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="text-sm font-medium leading-none">Job Recommender</div>
                            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                              Get personalized job recommendations
                            </p>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden md:block text-sm font-medium hover:text-primary">
              Log in
            </Link>
            <Button>Get Started</Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-12 md:py-24 lg:py-32">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                  Smart CV Analysis
                </h1>
                <p className="max-w-[600px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
                  Upload your CV and let our AI extract your skills and experience to help find the perfect job match.
                </p>
              </div>
            </div>

            <div className="mx-auto mt-8 max-w-2xl">
              <div className="rounded-lg border border-dashed p-8 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-medium">Upload your CV</h3>
                    <p className="text-sm text-gray-500">
                      Upload a PDF file of your CV for analysis
                    </p>
                  </div>
                  <div className="w-full max-w-sm">
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="cursor-pointer"
                    />
                  </div>
                  {file && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <FileText className="h-4 w-4" />
                      {file.name}
                    </div>
                  )}
                  <Button
                    onClick={handleUpload}
                    disabled={!file || isLoading}
                    className="gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Analyze CV
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <div className="mt-6 rounded-md bg-red-50 p-4 text-red-600">
                  {error}
                </div>
              )}

              {analysisResults && (
                <div className="mt-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Analysis Results</h2>
                    <Button
                      onClick={() => router.push("/job-recommender")}
                      className="gap-2"
                    >
                      Use for Job Recommendations
                    </Button>
                  </div>
                  
                  <div className="grid gap-6">
                    <div className="rounded-lg border bg-card p-6">
                      <h3 className="text-lg font-semibold mb-4">Extracted Text</h3>
                      <div className="whitespace-pre-wrap font-mono text-sm overflow-auto max-h-[500px]">
                        {extractedText ? (
                          <div className="p-4 bg-gray-50 rounded">
                            <pre className="whitespace-pre-wrap break-words text-sm">
                              {extractedText}
                            </pre>
                          </div>
                        ) : (
                          <p className="text-gray-500">No text extracted yet</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border bg-card p-6">
                      <h3 className="text-lg font-semibold mb-4">Analysis</h3>
                      <div className="space-y-4">
                        {/* Skills */}
                        {analysisResults.skills && Object.keys(analysisResults.skills).length > 0 && (
                          <div className="space-y-2">
                            <h3 className="text-xl font-semibold">Skills</h3>
                            <div className="grid gap-4">
                              {Object.entries(analysisResults.skills).map(([category, skills]) => {
                                if (Array.isArray(skills) && skills.length > 0) {
                                  return (
                                    <div key={category} className="space-y-2">
                                      <h4 className="font-medium capitalize">{category}</h4>
                                      <div className="flex flex-wrap gap-2">
                                        {skills.map((skill: string, index: number) => (
                                          <span
                                            key={index}
                                            className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm"
                                          >
                                            {skill}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          </div>
                        )}

                        <div>
                          <h4 className="font-medium mb-2">Job Titles</h4>
                          <div className="flex flex-wrap gap-2">
                            {analysisResults.job_titles?.map((title: string, index: number) => (
                              <span key={index} className="px-3 py-1 bg-primary/10 rounded-full text-sm">
                                {title}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Education</h4>
                          <div className="space-y-2">
                            {analysisResults.education?.map((edu: any, index: number) => (
                              <p key={index} className="text-sm">{edu.institution} - {edu.degree} ({edu.year})</p>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Experience</h4>
                          <div className="space-y-2">
                            {analysisResults.experience?.map((exp: any, index: number) => (
                              <p key={index} className="text-sm">{exp.company} - {exp.position} ({exp.duration})</p>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Named Entities</h4>
                          <div className="space-y-4">
                            {analysisResults.entities && Object.entries(
                              analysisResults.entities.reduce((acc: { [key: string]: string[] }, entity: any) => {
                                if (!acc[entity.label]) {
                                  acc[entity.label] = [];
                                }
                                if (!acc[entity.label].includes(entity.text)) {
                                  acc[entity.label].push(entity.text);
                                }
                                return acc;
                              }, {})
                            ).map(([label, entities]) => (
                              <div key={label} className="space-y-2">
                                <h5 className="font-medium capitalize">{label.toLowerCase()}</h5>
                                <div className="flex flex-wrap gap-2">
                                  {(entities as string[]).map((entity: string, index: number) => (
                                    <span
                                      key={index}
                                      className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm"
                                    >
                                      {entity}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
} 