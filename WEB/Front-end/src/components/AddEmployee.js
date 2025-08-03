import React, { useState } from 'react';
import { Button, CssBaseline, TextField, Box, Typography, Container } from '@mui/material';
import Alert from '@mui/material/Alert';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import axios from 'axios';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

// Custom theme
const customTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#ff6699', // สีชมพูอ่อน
    },
    background: {
      default: '#F8E9F0', // สีพื้นหลัง
    },
    text: {
      primary: '#000000', // สีดำสำหรับข้อความหลัก
      secondary: '#666666', // สีเทาสำหรับข้อความรอง
    },
  },
  typography: {
    h1: {
      fontSize: '30px', // เพิ่มขนาดเป็น 50px
      fontWeight: 'bold',
      color: '#ff6699',
    },
    h5: {
      color: '#333333',
    },
    h6: {
      color: '#333333',
      fontWeight: 'bold',
    },
  },
});

export default function AddEmployee() {
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [positionID, setPositionID] = useState('');
  const [phonenumber, setPhonenumber] = useState(''); // เพิ่ม state สำหรับเบอร์โทร
  const [profileImage, setProfileImage] = useState(null); // เพิ่ม state สำหรับจัดเก็บรูปภาพ
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);
  const [imagePreview, setImagePreview] = useState(''); // เพิ่ม state สำหรับ preview รูปภาพ

  // ฟังก์ชันสำหรับอัปโหลดรูปภาพ
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfileImage(file);
      setImagePreview(URL.createObjectURL(file)); // ตั้งค่า preview รูปภาพ
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formData = new FormData(); // ใช้ FormData เพื่อให้รองรับการอัปโหลดไฟล์
    formData.append('username', username);
    formData.append('firstName', firstName);
    formData.append('lastName', lastName);
    formData.append('email', email);
    formData.append('gender', gender);
    formData.append('positionID', positionID);
    formData.append('phonenumber', phonenumber); // เพิ่มเบอร์โทรลงใน FormData
    if (profileImage) {
      formData.append('profileImage', profileImage); // เพิ่มรูปภาพลงใน FormData
    }

    try {
      const response = await axios.post(process.env.REACT_APP_BASE_URL + '/employee', formData, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data' // ใช้ multipart/form-data ในการส่งข้อมูล
        }
      });
      const result = response.data;
      setMessage(result['message']);
      setStatus(result['status']);

      if (result['status'] === true) {
        // Reset fields
        setUsername('');
        setFirstName('');
        setLastName('');
        setEmail('');
        setGender('');
        setPositionID('');
        setPhonenumber(''); // Reset เบอร์โทร
        setProfileImage(null); // Reset รูปภาพ
        setImagePreview(''); // Reset รูปภาพที่ preview
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
              marginTop: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '40px',
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

            {/* ฟิลด์สำหรับอัปโหลดรูปภาพ */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
              {/* แสดง preview รูปภาพถ้ามี */}
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
                    border: '2px solid black' // เพิ่มขอบสีดำ
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

              <TextField
                fullWidth
                id="gender"
                label="Gender"
                name="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                sx={{ mb: 2, backgroundColor: '#fff', borderRadius: '10px' }}
              />

              <TextField
                fullWidth
                id="positionID"
                label="Position ID"
                name="positionID"
                value={positionID}
                onChange={(e) => setPositionID(e.target.value)}
                sx={{ mb: 2, backgroundColor: '#fff', borderRadius: '10px' }}
              />

              {/* เพิ่มฟิลด์สำหรับเบอร์โทร */}
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
                variant="contained" // เปลี่ยนปุ่มเป็นปุ่มแบบพื้นหลังเต็ม
                sx={{
                  mt: 3,
                  mb: 2,
                  color: '#fff',
                  backgroundColor: '#ff6699', // สีพื้นหลังชมพูอ่อน
                  padding: '12px',
                  borderRadius: '15px',
                  textAlign: 'center',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)', // เพิ่มเงาเล็กน้อย
                  '&:hover': {
                    backgroundColor: '#ff3366', // สีเข้มขึ้นเมื่อ hover
                  },
                }}
              >
                เพิ่มข้อมูลแอดมิน
              </Button>

              {/* ปุ่มย้อนกลับไปหน้า Dashboard */}
              <Button
                fullWidth
                variant="text"
                startIcon={<ArrowBackIcon />} // ไอคอนย้อนกลับ
                onClick={() => window.location = '/dashboard'}
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
