import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ColorConfig } from "@/types";

interface NodeColorSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: ColorConfig) => void;
  currentConfig: ColorConfig;
}

const COLOR_PALETTE = [
  { name: 'White', value: '#ffffff', bg: 'bg-white', border: 'border-gray-300' },
  { name: 'Red', value: '#ef4444', bg: 'bg-red-500', border: 'border-red-500' },
  { name: 'Orange', value: '#f97316', bg: 'bg-orange-500', border: 'border-orange-500' },
  { name: 'Yellow', value: '#eab308', bg: 'bg-yellow-500', border: 'border-yellow-500' },
  { name: 'Green', value: '#22c55e', bg: 'bg-green-500', border: 'border-green-500' },
  { name: 'Blue', value: '#3b82f6', bg: 'bg-blue-500', border: 'border-blue-500' },
  { name: 'Indigo', value: '#6366f1', bg: 'bg-indigo-500', border: 'border-indigo-500' },
  { name: 'Purple', value: '#a855f7', bg: 'bg-purple-500', border: 'border-purple-500' },
  { name: 'Pink', value: '#ec4899', bg: 'bg-pink-500', border: 'border-pink-500' },
  { name: 'Gray', value: '#6b7280', bg: 'bg-gray-500', border: 'border-gray-500' },
  { name: 'Black', value: '#000000', bg: 'bg-black', border: 'border-black' },
  { name: 'Emerald', value: '#10b981', bg: 'bg-emerald-500', border: 'border-emerald-500' },
  { name: 'Teal', value: '#14b8a6', bg: 'bg-teal-500', border: 'border-teal-500' },
  { name: 'Cyan', value: '#06b6d4', bg: 'bg-cyan-500', border: 'border-cyan-500' },
  { name: 'Sky', value: '#0ea5e9', bg: 'bg-sky-500', border: 'border-sky-500' },
  { name: 'Rose', value: '#f43f5e', bg: 'bg-rose-500', border: 'border-rose-500' }
];

const NodeColorSettings = ({ isOpen, onClose, onSave, currentConfig }: NodeColorSettingsProps) => {
  const [config, setConfig] = useState<ColorConfig>(currentConfig);

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  const ColorPicker = ({ selectedColor, onColorChange, label }: {
    selectedColor: string;
    onColorChange: (color: string) => void;
    label: string;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="grid grid-cols-8 gap-2">
        {COLOR_PALETTE.map((color) => (
          <button
            key={color.value}
            className={`w-8 h-8 rounded border-2 transition-all hover:scale-110 ${color.bg} ${
              selectedColor === color.value ? 'border-foreground shadow-lg' : color.border
            }`}
            onClick={() => onColorChange(color.value)}
            title={color.name}
          />
        ))}
      </div>
    </div>
  );

  const renderPreview = () => {
    const eventRate = 0.7; // Example event rate for preview
    
    // Helper function to convert hex to rgba
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 255, b: 255 };
    };
    
    switch (config.mode) {
      case 'solid':
        const solidRgb = hexToRgb(config.color1);
        return (
          <div 
            className="w-24 h-16 border border-border rounded flex items-center justify-center"
            style={{ 
              backgroundColor: `rgba(${solidRgb.r}, ${solidRgb.g}, ${solidRgb.b}, 0.5)` // 50% transparency
            }}
          >
            <span className="text-xs font-medium text-foreground">Node</span>
          </div>
        );
      
      case 'split':
        const splitPercentage = eventRate * 100;
        return (
          <div className="w-24 h-16 border border-border rounded overflow-hidden flex">
            <div 
              style={{ 
                backgroundColor: config.color1,
                width: `${splitPercentage}%`
              }}
            />
            <div 
              style={{ 
                backgroundColor: '#ffffff',
                width: `${100 - splitPercentage}%`
              }}
            />
          </div>
        );
      
      case 'gradient':
        const gradientRgb = hexToRgb(config.color1);
        const transparency = 0.1 + (eventRate * 0.8); // Varies from 0.1 to 0.9 based on event rate for greater contrast
        
        return (
          <div 
            className="w-24 h-16 border border-border rounded flex items-center justify-center"
            style={{
              backgroundColor: `rgba(${gradientRgb.r}, ${gradientRgb.g}, ${gradientRgb.b}, ${transparency})`
            }}
          >
            <span className="text-xs font-medium text-foreground">Node</span>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Node Colour Settings</DialogTitle>
          <DialogDescription>
            Configure how decision tree nodes are coloured based on event rates. The selected colour will also be applied to node borders, arrows, and connection lines.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Color Mode Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Colour Mode</Label>
            <RadioGroup
              value={config.mode}
              onValueChange={(value: 'solid' | 'split' | 'gradient') => 
                setConfig(prev => ({ ...prev, mode: value }))
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="solid" id="solid" />
                <Label htmlFor="solid">Solid Colours - Single colour for all nodes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="split" id="split" />
                <Label htmlFor="split">Split Colours - Horizontal split based on event rate</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="gradient" id="gradient" />
                <Label htmlFor="gradient">Gradient Colours - Adjust transparency based on event rate</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Color Selection */}
          <div className="space-y-4">
            <ColorPicker
              selectedColor={config.color1}
              onColorChange={(color) => setConfig(prev => ({ ...prev, color1: color }))}
              label={config.mode === 'split' ? 'Primary Colour' : 'Node Colour'}
            />
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Preview (70% Event Rate)</Label>
            <div className="flex items-center justify-center p-4 bg-accent/10 rounded-lg">
              {renderPreview()}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Apply Colours
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NodeColorSettings;