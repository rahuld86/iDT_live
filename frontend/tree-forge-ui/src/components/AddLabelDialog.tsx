import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiService } from '@/services/api';

interface AddLabelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  nodeNumber: number;
  existingLabel?: string | null;
  onLabelAdded: () => void;
}

const AddLabelDialog: React.FC<AddLabelDialogProps> = ({
  isOpen,
  onClose,
  nodeNumber,
  existingLabel,
  onLabelAdded,
}) => {
  const [label, setLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Reset label when dialog opens or existing label changes
  React.useEffect(() => {
    if (isOpen) {
      setLabel(existingLabel || '');
    }
  }, [isOpen, existingLabel]);

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow letters, numbers, underscore, hyphen, and space
    // Limit to 10 characters
    if (value.length <= 10 && /^[a-zA-Z0-9_\-\s]*$/.test(value)) {
      setLabel(value);
    }
  };

  const handleSubmit = async () => {
    if (!label.trim()) {
      toast({
        title: "Invalid Input",
        description: "Please enter a label.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      console.log(`${existingLabel ? 'Updating' : 'Adding'} label "${label}" to node ${nodeNumber}`);
      const response = await apiService.labelNode(nodeNumber, label.trim());
      
      if (response.node_master) {
        toast({
          title: "Success",
          description: `Label "${label}" ${existingLabel ? 'updated for' : 'added to'} node ${nodeNumber} successfully!`,
        });
        
        // Clear the input and close dialog
        setLabel('');
        onClose();
        
        // Trigger tree refresh
        onLabelAdded();
      } else {
        throw new Error('Invalid response from server');
      }
      
    } catch (error) {
      console.error('Error adding label:', error);
      toast({
        title: "Error",
        description: "Failed to add label. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setLabel('');
    onClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) {
      handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {existingLabel ? 'Edit Label for Node' : 'Add Label to Node'} {nodeNumber}
          </DialogTitle>
          <DialogDescription>
            {existingLabel 
              ? 'Edit the label for this node. The label can contain letters, numbers, underscores, hyphens, and spaces (max 10 characters).'
              : 'Enter a label for this node. The label can contain letters, numbers, underscores, hyphens, and spaces (max 10 characters).'
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="label" className="text-right">
              Label
            </Label>
            <Input
              id="label"
              value={label}
              onChange={handleLabelChange}
              onKeyPress={handleKeyPress}
              placeholder="Enter label..."
              className="col-span-3"
              maxLength={10}
              disabled={isSubmitting}
            />
          </div>
          <div className="text-xs text-muted-foreground text-center">
            {label.length}/10 characters
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isSubmitting || !label.trim()}
          >
            {isSubmitting 
              ? (existingLabel ? 'Updating...' : 'Adding...') 
              : (existingLabel ? 'Update Label' : 'Add Label')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddLabelDialog;