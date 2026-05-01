<?php

namespace App\Services;

use App\Models\User;

class UserService
{
    public function currentUser(): User
    {
        return new User();
    }
}
