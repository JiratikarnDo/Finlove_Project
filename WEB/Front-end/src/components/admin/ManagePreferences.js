import React, { useEffect, useState } from 'react';
import { Button, Box, Grid, Typography, Paper, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import axios from 'axios';

const url = process.env.REACT_APP_BASE_URL;
const token = localStorage.getItem('token');

export default function ManagePreferences() {
  const [preferences, setPreferences] = useState([]);
  const [selectedPreference, setSelectedPreference] = useState(null);
  const [newPreference, setNewPreference] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogType, setDialogType] = useState('');

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await axios.get(`${url}/preferences`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setPreferences(response.data);
    } catch (error) {
      console.error('Error fetching preferences:', error);
    }
  };

  const handleSelectPreference = (id) => {
    if (selectedPreference === id) {
        setSelectedPreference(null);
        setNewPreference('');
    } else {
        setSelectedPreference(id);
        setNewPreference(preferences.find((pref) => pref.PreferenceID === id)?.PreferenceNames || '');
    }
  };

  const handleDeletePreference = async () => {
    if (selectedPreference) {
      try {
        await axios.delete(`${url}/preferences/${selectedPreference}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setSelectedPreference(null);
        fetchPreferences();
        setOpenDialog(false);
      } catch (error) {
        console.error('Error deleting preference:', error);
      }
    }
  };

  const handleAddPreference = async () => {
    if (newPreference.trim()) {
      try {
        await axios.post(`${url}/preferences`, { PreferenceName: newPreference }, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setNewPreference('');
        fetchPreferences();
        setOpenDialog(false);
      } catch (error) {
        console.error('Error adding preference:', error);
      }
    }
  };

  const handleUpdatePreference = async () => {
    if (selectedPreference && newPreference.trim()) {
      try {
        await axios.put(`${url}/preferences/${selectedPreference}`, { PreferenceName: newPreference }, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setSelectedPreference(null);
        setNewPreference('');
        fetchPreferences();
        setOpenDialog(false);
      } catch (error) {
        console.error('Error updating preference:', error);
      }
    }
  };

  const openModal = (type) => {
    setDialogType(type);
    setOpenDialog(true);
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#fdeef4' }}>
      <Paper
        sx={{
          padding: 3,
          width: '70%',
          maxWidth: '800px',
          backgroundColor: '#fff',
          borderRadius: '20px',
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
          border: '2px solid black' // เพิ่มกรอบสีดำ
        }}
      >
        <Typography variant="h6" sx={{ textAlign: 'center', fontWeight: 'bold', color: '#000' }}>
          จัดการความชอบ
        </Typography>
        <Grid container spacing={2} sx={{ marginTop: 2 }}>
          {preferences.map((pref) => (
            <Grid item xs={4} key={pref.PreferenceID}>
              <Box
                sx={{
                  border: selectedPreference === pref.PreferenceID ? '2px solid #ff69b4' : '1px solid black',
                  backgroundColor: selectedPreference === pref.PreferenceID ? '#ff69b4' : '#ffffff',
                  color: selectedPreference === pref.PreferenceID ? 'white' : 'black',
                  padding: '10px',
                  textAlign: 'center',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    backgroundColor: selectedPreference === pref.PreferenceID ? '#ff69b4' : '#f5f5f5',
                  },
                }}
                onClick={() => handleSelectPreference(pref.PreferenceID)}
              >
                {pref.PreferenceNames}
              </Box>
            </Grid>
          ))}
        </Grid>

        <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: 3, gap: 2 }}>
          <Button
            variant="contained"
            onClick={() => openModal('add')}
            sx={{ backgroundColor: '#ff69b4', borderRadius: '10px', padding: '10px 20px', color: '#fff' }}
          >
            เพิ่ม
          </Button>
          <Button
            variant="contained"
            onClick={() => openModal('delete')}
            disabled={!selectedPreference}
            sx={{ backgroundColor: '#808080', borderRadius: '10px', padding: '10px 20px', color: '#fff' }}
          >
            ลบ
          </Button>
          <Button
            variant="contained"
            onClick={() => openModal('edit')}
            disabled={!selectedPreference}
            sx={{ backgroundColor: '#ff69b4', borderRadius: '10px', padding: '10px 20px', color: '#fff' }}
          >
            แก้ไข
          </Button>
        </Box>

        <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
          <DialogTitle>{dialogType === 'add' ? 'กรอกข้อมูลความชอบที่ต้องการเพิ่ม' : dialogType === 'edit' ? 'กรอกข้อมูลความชอบที่ต้องการแก้ไข' : 'คุณแน่ใจหรือไม่ที่จะลบความชอบนี้'}</DialogTitle>
          {dialogType !== 'delete' && (
            <DialogContent>
              <TextField
                value={newPreference}
                onChange={(e) => setNewPreference(e.target.value)}
                label="ความชอบ"
                variant="outlined"
                fullWidth
              />
            </DialogContent>
          )}
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)} color="secondary">ยกเลิก</Button>
            <Button
              onClick={dialogType === 'add' ? handleAddPreference : dialogType === 'edit' ? handleUpdatePreference : handleDeletePreference}
              color="primary"
            >
              {dialogType === 'add' ? 'เพิ่ม' : dialogType === 'edit' ? 'แก้ไข' : 'ยืนยัน'}
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Box>
  );
}