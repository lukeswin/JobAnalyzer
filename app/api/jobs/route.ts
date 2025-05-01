import { NextResponse } from "next/server"
import { mockJobs, Job } from "@/lib/mock-jobs"

interface JobSearchParams {
  skills?: string
  experience?: number
  location?: string
  salary?: string
  industry?: string
}

function calculateMatchScore(job: Job, params: JobSearchParams): number {
  let score = 0
  let totalWeights = 0

  // Skills matching (40% weight)
  if (params.skills) {
    totalWeights += 40
    const userSkills = params.skills.toLowerCase().split(",").map(s => s.trim())
    const matchingSkills = job.skills.filter(skill => 
      userSkills.some(userSkill => skill.toLowerCase().includes(userSkill))
    )
    score += (matchingSkills.length / job.skills.length) * 40
  }

  // Experience matching (20% weight)
  if (params.experience !== undefined) {
    totalWeights += 20
    if (job.experience <= params.experience) {
      score += 20
    } else {
      score += (params.experience / job.experience) * 20
    }
  }

  // Location matching (20% weight)
  if (params.location) {
    totalWeights += 20
    if (job.location.toLowerCase().includes(params.location.toLowerCase())) {
      score += 20
    }
  }

  // Industry matching (20% weight)
  if (params.industry) {
    totalWeights += 20
    if (job.industry.toLowerCase().includes(params.industry.toLowerCase())) {
      score += 20
    }
  }

  // If no criteria were provided, return a random score between 40-60
  if (totalWeights === 0) {
    return Math.random() * 20 + 40
  }

  // Normalize the score based on the weights that were actually used
  return (score / totalWeights) * 100
}

export async function POST(request: Request) {
  try {
    const params: JobSearchParams = await request.json()

    // Calculate match scores for all jobs
    const jobsWithScores = mockJobs.map(job => ({
      ...job,
      matchScore: calculateMatchScore(job, params)
    }))

    // Sort by match score and return top 5 matches
    const recommendedJobs = jobsWithScores
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5)

    return NextResponse.json(recommendedJobs)
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process job recommendations" },
      { status: 500 }
    )
  }
} 