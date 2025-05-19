import { NextResponse } from "next/server"
import { searchJobs, Job } from "@/lib/db"

interface JobSearchParams {
  skills?: string
  location?: string
}

function calculateMatchScore(job: Job, params: JobSearchParams): number {
  let score = 0
  let totalWeights = 0

  // Skills matching (100% weight)
  if (params.skills && job.skills) {
    totalWeights += 100
    const userSkills = params.skills.toLowerCase().split(",").map(s => s.trim())
    const matchingSkills = job.skills.filter(skill => 
      userSkills.some(userSkill => skill.toLowerCase().includes(userSkill))
    )
    score += (matchingSkills.length / job.skills.length) * 100
  }

  // If no criteria were provided, return a random score between 40-60
  if (totalWeights === 0) {
    return Math.random() * 20 + 40
  }

  return score
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const jobs = await searchJobs(body)
    return NextResponse.json(jobs)
  } catch (error) {
    console.error('Error searching jobs:', error)
    return NextResponse.json(
      { error: 'Failed to search jobs' },
      { status: 500 }
    )
  }
} 