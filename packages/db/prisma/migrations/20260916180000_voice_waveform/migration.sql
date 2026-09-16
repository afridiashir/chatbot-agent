-- Voice-note waveform: loudness bars captured while recording.
ALTER TABLE "Attachment" ADD COLUMN "waveform" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
