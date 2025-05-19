import { NextResponse } from 'next/server';
import { getUniqueLocations } from '@/lib/db';

export async function GET(request: Request) {
  console.log('API route: Starting locations request');
  
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query')?.toLowerCase() || '';
    console.log('API route: Search query:', query);

    console.log('API route: Calling getUniqueLocations...');
    const locations = await getUniqueLocations();
    console.log('API route: Raw locations from DB:', locations);
    
    if (!locations || locations.length === 0) {
      console.log('API route: No locations found in database');
      return NextResponse.json([]);
    }
    
    // Filter locations based on query with null checks
    const filteredLocations = locations.filter(location => {
      if (!location || !location.city || !location.country) return false;
      return location.city.toLowerCase().includes(query) || 
             location.country.toLowerCase().includes(query);
    });
    console.log('API route: Filtered locations:', filteredLocations);

    // Format locations for the combobox with validation
    const formattedLocations = filteredLocations
      .filter(location => location && location.city && location.country)
      .map(location => ({
        value: `${location.city}, ${location.country}`,
        label: `${location.city}, ${location.country}`
      }));
    console.log('API route: Formatted locations:', formattedLocations);

    return NextResponse.json(formattedLocations);
  } catch (error) {
    console.error('API route: Error in locations API:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'Unknown'
    });

    // Return a more detailed error response
    return NextResponse.json(
      { 
        error: 'Failed to fetch locations',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
} 