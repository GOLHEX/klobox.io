import React from 'react';
import './../tailwind/tailwind.css';
 // Импортируйте свой CSS-файл здесь
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons";

class UserProfile extends React.Component {
  render() {
    return (
      <div className="UserProfile" >
        <FontAwesomeIcon icon={faUser} />
        {/* <a href="/login">SignIN</a>
        <a href="/signup">SignUp</a> */}
      </div>
    );
  }
}

export default UserProfile;