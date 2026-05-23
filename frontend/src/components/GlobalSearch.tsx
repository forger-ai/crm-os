import { useEffect, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  InputBase,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Popper,
  Typography,
  alpha,
  styled,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useNavigate } from "react-router-dom";
import { searchAll } from "../api/search";
import type { SearchResults } from "../api/types";

const Wrap = styled(Box)(({ theme }) => ({
  position: "relative",
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.18),
  "&:hover": { backgroundColor: alpha(theme.palette.common.white, 0.28) },
  paddingLeft: theme.spacing(1.5),
  paddingRight: theme.spacing(1.5),
  display: "flex",
  alignItems: "center",
  width: 340,
}));

const SearchInput = styled(InputBase)(({ theme }) => ({
  color: theme.palette.common.white,
  marginLeft: theme.spacing(1),
  flex: 1,
  "& input::placeholder": { color: alpha(theme.palette.common.white, 0.7) },
}));

export default function GlobalSearch() {
  const [value, setValue] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (value.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchAll(value, 6)
        .then((data) => setResults(data))
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [value]);

  const open = !!results && (results.organizations.length > 0
    || results.contacts.length > 0
    || results.deals.length > 0);

  const handleNavigate = (path: string) => {
    setValue("");
    setResults(null);
    navigate(path);
  };

  return (
    <Wrap ref={anchorRef}>
      <SearchIcon fontSize="small" />
      <SearchInput
        placeholder="Buscar contactos, empresas, deals…"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {loading && <CircularProgress size={16} sx={{ color: "white" }} />}
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        style={{ zIndex: 1300, width: 340 }}
      >
        <Paper variant="outlined" sx={{ mt: 1, maxHeight: 360, overflow: "auto" }}>
          {results?.organizations.length ? (
            <Box>
              <Typography variant="overline" sx={{ px: 2 }} color="text.secondary">
                Empresas
              </Typography>
              <List dense disablePadding>
                {results.organizations.map((hit) => (
                  <ListItemButton
                    key={`org-${hit.id}`}
                    onClick={() => handleNavigate(`/organizations/${hit.id}`)}
                  >
                    <ListItemText primary={hit.label} secondary={hit.sublabel} />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          ) : null}
          {results?.contacts.length ? (
            <Box>
              <Typography variant="overline" sx={{ px: 2 }} color="text.secondary">
                Contactos
              </Typography>
              <List dense disablePadding>
                {results.contacts.map((hit) => (
                  <ListItemButton
                    key={`c-${hit.id}`}
                    onClick={() => handleNavigate(`/contacts/${hit.id}`)}
                  >
                    <ListItemText primary={hit.label} secondary={hit.sublabel} />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          ) : null}
          {results?.deals.length ? (
            <Box>
              <Typography variant="overline" sx={{ px: 2 }} color="text.secondary">
                Deals
              </Typography>
              <List dense disablePadding>
                {results.deals.map((hit) => (
                  <ListItemButton
                    key={`d-${hit.id}`}
                    onClick={() => handleNavigate(`/deals/${hit.id}`)}
                  >
                    <ListItemText primary={hit.label} secondary={hit.sublabel} />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          ) : null}
        </Paper>
      </Popper>
    </Wrap>
  );
}
