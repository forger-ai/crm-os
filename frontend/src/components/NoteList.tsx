import { useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import type { NoteRead } from "../api/types";
import { formatDateTime } from "../utils/format";

interface Props {
  notes: NoteRead[];
  onCreate: (body: string) => Promise<void>;
  onTogglePin: (note: NoteRead) => Promise<void>;
  onDelete: (note: NoteRead) => Promise<void>;
}

export default function NoteList({
  notes,
  onCreate,
  onTogglePin,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await onCreate(body);
      setDraft("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1.5}>
      <TextField
        multiline
        minRows={2}
        size="small"
        placeholder="Escribe una nota…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Box>
        <Button
          variant="contained"
          size="small"
          disabled={busy || !draft.trim()}
          onClick={submit}
        >
          Agregar nota
        </Button>
      </Box>
      {notes.map((note) => (
        <Paper key={note.id} variant="outlined" sx={{ p: 1.5 }}>
          <Stack
            direction="row"
            alignItems="flex-start"
            justifyContent="space-between"
            spacing={1}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {note.body}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatDateTime(note.created_at)}
                {note.author && ` · ${note.author}`}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5}>
              <IconButton size="small" onClick={() => onTogglePin(note)}>
                {note.pinned ? (
                  <PushPinIcon fontSize="small" color="primary" />
                ) : (
                  <PushPinOutlinedIcon fontSize="small" />
                )}
              </IconButton>
              <IconButton size="small" onClick={() => onDelete(note)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
