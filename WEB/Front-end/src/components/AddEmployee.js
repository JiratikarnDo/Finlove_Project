import React, { useState } from 'react';
import {
  Button, CssBaseline, TextField, Box, Typography, Container,
  Alert, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import axios from 'axios';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

// ---- options (id -> label) ----
const GENDER_OPTIONS = [
  { value: 1, label: 'Male' },
  { value: 2, label: 'Female' },
  { value: 3, label: 'Other' },
];

const POSITION_OPTIONS = [
  { value: 1, label: 'Admin' },
  { value: 2, label: 'Employee' },
];

// ---- theme (คงโทนเดิม) ----
const customTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#ff6699' },
    background: { default: '#F8E9F0' },
    text: { primary: '#000', secondary: '#666' },
  },
  typography: {
    h1: { fontSize: '30px', fontWeight: 'bold', color: '#ff6699' },
    h6: { color: '#333', fontWeight: 'bold' },
  },
});

export default function AddEmployee() {
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');          // เก็บเป็น string เพื่อผูกกับ Select ได้ดี
  const [positionID, setPositionID] = useState('');  // เก็บเป็น string เช่นกัน
  const [phonenumber, setPhonenumber] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);

  // เลือกรูป & preview
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfileImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // ตรวจฟิลด์จำเป็นคร่าว ๆ
    if (!username || !firstName || !lastName || !gender || !positionID) {
      setMessage('กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบ');
      setStatus(false);
      return;
    }

    const formData = new FormData();
    formData.append('username', username);
    formData.append('firstName', firstName);
    formData.append('lastName', lastName);
    formData.append('email', email);
    // แปลง dropdown -> number ก่อนส่ง (แบ็คเอนด์จะรับเป็น string ก็แคสเป็น int ได้)
    formData.append('gender', String(Number(gender)));
    formData.append('positionID', String(Number(positionID)));
    formData.append('phonenumber', phonenumber);
    if (profileImage) formData.append('profileImage', profileImage);

    try {
      const response = await axios.post(
        `${process.env.REACT_APP_BASE_URL}/employee`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            // ปล่อยให้ axios ตั้ง boundary เองจะปลอดภัยกว่า:
            // 'Content-Type': 'multipart/form-data'
          },
        }
      );

      const result = response.data;
      setMessage(result?.message || 'สำเร็จ');
      setStatus(!!result?.status);

      if (result?.status === true) {
        // reset ฟอร์ม
        setUsername('');
        setFirstName('');
        setLastName('');
        setEmail('');
        setGender('');
        setPositionID('');
        setPhonenumber('');
        setProfileImage(null);
        setImagePreview('');
      }
    } catch (err) {
      console.log(err);
      setMessage('เกิดข้อผิดพลาดในการเพิ่มพนักงาน');
      setStatus(false);
    }
  };

  return (
    <ThemeProvider theme={customTheme}>
      <Box
        sx={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8E9F0',
        }}
      >
        <Container component="main" maxWidth="xs">
          <CssBaseline />
          <Box
            sx={{
              mt: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              p: '40px',
            }}
          >
            <Typography component="h1" variant="h1" sx={{ mb: 3 }}>
              เพิ่มข้อมูลแอดมิน
            </Typography>

            {message && (
              <Alert severity={status ? 'success' : 'error'} sx={{ width: '100%', mb: 2 }}>
                {message}
              </Alert>
            )}

            {/* อัปโหลด & พรีวิวรูป */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
              {imagePreview && (
                <Box
                  component="img"
                  src={imagePreview}
                  alt="Profile Preview"
                  sx={{
                    width: 200,
                    height: 200,
                    borderRadius: '10px',
                    objectFit: 'cover',
                    border: '2px solid black',
                  }}
                />
              )}

              <input
                accept="image/*"
                style={{ display: 'none' }}
                id="profileImage"
                type="file"
                onChange={handleImageChange}
              />
              <label htmlFor="profileImage">
                <Button
                  variant="contained"
                  color="primary"
                  component="span"
                  startIcon={<PhotoCamera />}
                  sx={{ mt: 2, textTransform: 'none', borderRadius: '10px' }}
                >
                  อัปโหลดรูปภาพโปรไฟล์
                </Button>
              </label>
            </Box>

            {/* ฟอร์ม */}
            <Box component="form" noValidate onSubmit={handleSubmit} sx={{ width: '100%' }}>
              <TextField
                required
                fullWidth
                id="username"
                label="Username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                sx={{ mb: 2, backgroundColor: '#fff', borderRadius: '10px' }}
              />

              <TextField
                required
                fullWidth
                id="firstname"
                label="Firstname"
                name="firstname"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                sx={{ mb: 2, backgroundColor: '#fff', borderRadius: '10px' }}
              />

              <TextField
                required
                fullWidth
                id="lastname"
                label="Lastname"
                name="lastname"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                sx={{ mb: 2, backgroundColor: '#fff', borderRadius: '10px' }}
              />

              <TextField
                fullWidth
                id="email"
                label="Email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={{ mb: 2, backgroundColor: '#fff', borderRadius: '10px' }}
              />

              {/* Gender (dropdown -> ส่งเป็น id) */}
              <FormControl fullWidth sx={{ mb: 2, backgroundColor: '#fff', borderRadius: '10px' }}>
                <InputLabel id="gender-label">Gender</InputLabel>
                <Select
                  labelId="gender-label"
                  id="gender"
                  label="Gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  {GENDER_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Position (dropdown -> ส่งเป็น id) */}
              <FormControl fullWidth sx={{ mb: 2, backgroundColor: '#fff', borderRadius: '10px' }}>
                <InputLabel id="position-label">Position</InputLabel>
                <Select
                  labelId="position-label"
                  id="positionID"
                  label="Position"
                  value={positionID}
                  onChange={(e) => setPositionID(e.target.value)}
                >
                  {POSITION_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                fullWidth
                id="phonenumber"
                label="Phone Number"
                name="phonenumber"
                value={phonenumber}
                onChange={(e) => setPhonenumber(e.target.value)}
                sx={{ mb: 2, backgroundColor: '#fff', borderRadius: '10px' }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{
                  mt: 3,
                  mb: 2,
                  color: '#fff',
                  backgroundColor: '#ff6699',
                  padding: '12px',
                  borderRadius: '15px',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                  '&:hover': { backgroundColor: '#ff3366' },
                }}
              >
                เพิ่มข้อมูลแอดมิน
              </Button>

              <Button
                fullWidth
                variant="text"
                startIcon={<ArrowBackIcon />}
                onClick={() => (window.location = '/dashboard')}
                sx={{ color: '#000', mt: 1 }}
              >
                กลับไปหน้า Dashboard
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
