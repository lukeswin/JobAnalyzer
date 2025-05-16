"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface Location {
  value: string
  label: string
}

interface ComboboxProps {
  value: string | undefined
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function LocationCombobox({ value = "", onChange, placeholder = "Select location...", className }: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [locations, setLocations] = React.useState<Location[]>([])
  const [loading, setLoading] = React.useState(false)

  const fetchLocations = async (query: string) => {
    try {
      console.log('Fetching locations for query:', query);
      const response = await fetch(`/api/locations?query=${encodeURIComponent(query)}`);
      console.log('API Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error details:', errorData);
        throw new Error(errorData.details || 'Failed to fetch locations');
      }

      const data = await response.json();
      console.log('Received locations:', data);
      setLocations(data);
    } catch (error) {
      console.error('Error fetching locations:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      setLocations([]);
    }
  }

  React.useEffect(() => {
    console.log('Initial locations fetch');
    fetchLocations('')
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput 
            placeholder="Search location..." 
            onValueChange={fetchLocations}
          />
          <CommandEmpty>No location found.</CommandEmpty>
          <CommandGroup>
            {locations.map((location) => (
              <CommandItem
                key={location.value}
                value={location.value}
                onSelect={(currentValue) => {
                  onChange(currentValue === value ? "" : currentValue)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === location.value ? "opacity-100" : "opacity-0"
                  )}
                />
                {location.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
} 