import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const DELETE_THRESHOLD = 60; // px to reveal delete button

export default function SwipeableHistoryItem({ children, onDelete }) {
  const x = useMotionValue(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [swiped, setSwiped] = useState(false);
  const constraintsRef = useRef(null);

  // Button opacity appears as user swipes left
  const deleteOpacity = useTransform(x, [-DELETE_THRESHOLD, -20], [1, 0]);
  const deleteScale = useTransform(x, [-DELETE_THRESHOLD, -20], [1, 0.7]);

  const handleDragEnd = (_, info) => {
    if (info.offset.x < -DELETE_THRESHOLD) {
      // Snap to reveal delete button
      animate(x, -DELETE_THRESHOLD, { type: 'spring', stiffness: 300, damping: 30 });
      setSwiped(true);
    } else {
      // Snap back
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
      setSwiped(false);
    }
  };

  const handleDeleteTap = () => {
    setShowConfirm(true);
  };

  const handleConfirmDelete = () => {
    setShowConfirm(false);
    onDelete();
  };

  const handleCancel = () => {
    setShowConfirm(false);
    animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
    setSwiped(false);
  };

  return (
    <>
      <div ref={constraintsRef} className="relative overflow-hidden rounded-2xl">
        {/* Delete button behind */}
        <motion.div
          style={{ opacity: deleteOpacity, scale: deleteScale }}
          className="absolute right-0 top-0 bottom-0 w-16 flex items-center justify-center bg-destructive rounded-2xl"
        >
          <button onClick={handleDeleteTap} className="flex flex-col items-center gap-1">
            <Trash2 className="h-5 w-5 text-white" />
            <span className="text-[10px] text-white font-medium">Delete</span>
          </button>
        </motion.div>

        {/* Swipeable content */}
        <motion.div
          drag="x"
          dragConstraints={{ left: -DELETE_THRESHOLD, right: 0 }}
          dragElastic={0.1}
          style={{ x }}
          onDragEnd={handleDragEnd}
          onClick={() => {
            if (swiped) {
              animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
              setSwiped(false);
            }
          }}
          className="relative z-10 cursor-grab active:cursor-grabbing"
        >
          {children}
        </motion.div>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This health record will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel} className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="rounded-xl bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}